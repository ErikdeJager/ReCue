//! WebKitGTK renderer workarounds for Linux (#346/#347).
//!
//! On the NVIDIA blob (and inside GPU-less VMs), WebKitGTK's DMA-BUF renderer is the
//! classic "Tauri app is unusably slow / blank on Linux" failure: every frame takes a
//! broken or CPU-bound DMA-BUF path, dragging the whole webview down — terminal input
//! echo, painting, boot. The established fix is exporting
//! `WEBKIT_DISABLE_DMABUF_RENDERER=1` **before** GTK/WebKit initialize; wry (0.55) does
//! not set it, so ReCue must.
//!
//! But the workaround is itself expensive — with the bundled Skia WebKit it means CPU
//! rendering of the whole webview (which then cascades into software WebGL and xterm's
//! DOM renderer). #346 applied it whenever the NVIDIA kernel module was merely *present*,
//! which misfires on the common **hybrid laptop** (Intel/AMD iGPU + NVIDIA dGPU): there
//! the webview renders on the healthy Mesa iGPU, so the "fix" *was* the reported slowness.
//! #347 makes the detection GPU-aware — we look at what actually renders, not at what is
//! merely installed.
//!
//! Policy (the pure [`decide_dmabuf`], unit-tested on every host), in order:
//! 1. A user-set `WEBKIT_DISABLE_DMABUF_RENDERER` (any value) is always respected — we
//!    never write the variable ourselves.
//! 2. `RECUE_DISABLE_DMABUF=1|true|on|yes` forces the workaround on; `0|false|off|no`
//!    forces it off (the [`RendererOverride`] tri-state — the support escape hatches, see
//!    `TRAJECTORY_TO_LINUX.md`, and the seam a future Settings renderer-override card
//!    feeds into).
//! 3. NVIDIA GL explicitly selected via env (`__GLX_VENDOR_LIBRARY_NAME=nvidia` /
//!    `__NV_PRIME_RENDER_OFFLOAD=1`) while the blob is loaded → disable (the user routed
//!    GL through the blob, so the hybrid exemption does not apply).
//! 4. The NVIDIA blob is the **only** renderer (no Mesa card in `/sys/class/drm`, or that
//!    directory is unreadable) → disable.
//! 5. A VM with no native Mesa GPU → disable.
//! 6. Otherwise → keep DMA-BUF. Hybrid iGPU+dGPU boxes, nouveau, AMD/Intel-only, and a VM
//!    with a real passthrough GPU all render through Mesa, where DMA-BUF is healthy and
//!    fast — disabling it there *costs* performance.
//!
//! Either way exactly **one** diagnostic line is printed at boot naming the evidence
//! ([`describe_probe`]), so a real-box report can be read back against the policy.
//!
//! `WEBKIT_DISABLE_COMPOSITING_MODE` is never set automatically (it turns off accelerated
//! compositing wholesale); the opt-in `RECUE_DISABLE_COMPOSITING=1` is honored for
//! real-box debugging. Like `path_env`, the module compiles everywhere and the real work
//! is cfg-gated inside; the pure decision helpers are widened with `, test)` (the
//! `reveal_file_linux` precedent) so the macOS/Windows hosts still type-check and
//! unit-test them, while the impure `/sys`+`/proc` probes stay Linux-only.

// Only the Linux arm reads these (the pure helpers below take parsed values), so
// they stay Linux-gated — widening them with `, test)` would just be dead code on
// the macOS/Windows test builds.
#[cfg(all(unix, not(target_os = "macos")))]
const WEBKIT_DMABUF_VAR: &str = "WEBKIT_DISABLE_DMABUF_RENDERER";
#[cfg(all(unix, not(target_os = "macos")))]
const WEBKIT_COMPOSITING_VAR: &str = "WEBKIT_DISABLE_COMPOSITING_MODE";
#[cfg(all(unix, not(target_os = "macos")))]
const RECUE_DMABUF_VAR: &str = "RECUE_DISABLE_DMABUF";
#[cfg(all(unix, not(target_os = "macos")))]
const RECUE_COMPOSITING_VAR: &str = "RECUE_DISABLE_COMPOSITING";

/// Apply the WebKitGTK env-var workarounds. Must run **before** `tauri::Builder`
/// (GTK/WebKit read these variables at init) and before any threads spawn (env
/// mutation isn't thread-safe — `set_var` is a safe fn in edition 2021 but becomes
/// `unsafe` in Rust 2024 for exactly this reason). No-op on macOS and Windows.
pub fn apply_webkit_env_workarounds() {
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let (nvidia_kernel, nvidia_version) = probe_nvidia();
        let (gpus, gpu_drivers) = probe_gpus();
        let probe = DmabufProbe {
            user_set_dmabuf: std::env::var_os(WEBKIT_DMABUF_VAR).is_some(),
            over: resolve_override(),
            nvidia_kernel,
            nvidia_version,
            nvidia_gl_env: nvidia_gl_env(),
            vm: probe_vm(&gpus),
            gpus,
            gpu_drivers,
            session_type: std::env::var("XDG_SESSION_TYPE").ok(),
        };
        let decision = decide_dmabuf(&probe);
        if decision.disable {
            std::env::set_var(WEBKIT_DMABUF_VAR, "1");
        }
        // Exactly one line, for **both** outcomes (#347 — #346 only logged the disable
        // case), naming the evidence a real-box report is read back against.
        let outcome = if probe.user_set_dmabuf {
            "untouched"
        } else if decision.disable {
            "disabled"
        } else {
            "left on"
        };
        eprintln!(
            "[recue] WebKitGTK: DMA-BUF {outcome} — {} ({}) — override with {RECUE_DMABUF_VAR}=1|0",
            decision.reason,
            describe_probe(&probe),
        );

        // Debug-only opt-in; respect a user-set value like the DMA-BUF var above.
        if parse_force_flag(std::env::var(RECUE_COMPOSITING_VAR).ok().as_deref()) == Some(true)
            && std::env::var_os(WEBKIT_COMPOSITING_VAR).is_none()
        {
            std::env::set_var(WEBKIT_COMPOSITING_VAR, "1");
            eprintln!("[recue] WebKitGTK: set {WEBKIT_COMPOSITING_VAR}=1 ({RECUE_COMPOSITING_VAR} opt-in)");
        }
    }
}

// ---------------------------------------------------------------------------
// The pure model + decision (compiled and unit-tested on every host)
// ---------------------------------------------------------------------------

/// How the renderer decision may be overridden. Only `RECUE_DISABLE_DMABUF` produces a
/// non-`Auto` value today; a future Settings renderer-override card feeds a persisted
/// mode into the same seam (see [`resolve_override`]).
#[cfg(any(all(unix, not(target_os = "macos")), test))]
#[cfg_attr(test, allow(dead_code))]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum RendererOverride {
    /// Decide from the hardware probe.
    Auto,
    /// Always disable the DMA-BUF renderer.
    ForceDisable,
    /// Never disable the DMA-BUF renderer.
    ForceKeep,
}

/// Which NVIDIA kernel module (if any) is loaded. `Open` (nvidia-open) and `Proprietary`
/// gate identically — nvidia-open ships the *same* proprietary userspace EGL the DMA-BUF
/// workaround targets — but the flavor is logged.
#[cfg(any(all(unix, not(target_os = "macos")), test))]
#[cfg_attr(test, allow(dead_code))]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum NvidiaKernel {
    Absent,
    Proprietary,
    Open,
}

/// What a `/sys/class/drm/cardN` node renders with.
#[cfg(any(all(unix, not(target_os = "macos")), test))]
#[cfg_attr(test, allow(dead_code))]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum GpuClass {
    /// A Mesa-driven card (i915/xe/amdgpu/radeon/nouveau/…) — DMA-BUF is healthy here.
    Mesa,
    /// The NVIDIA blob (proprietary or nvidia-open kernel module).
    NvidiaBlob,
    /// A virtual/paravirtual display device (virtio-gpu, vmwgfx, qxl, …).
    Virtual,
    /// Present but unclassifiable (unknown driver *and* unknown PCI vendor).
    Unknown,
}

/// Everything the boot-time probes saw — the input to the pure decision.
#[cfg(any(all(unix, not(target_os = "macos")), test))]
#[cfg_attr(test, allow(dead_code))]
#[derive(Debug, Clone)]
pub(crate) struct DmabufProbe {
    /// The user already exported `WEBKIT_DISABLE_DMABUF_RENDERER` themselves.
    pub user_set_dmabuf: bool,
    /// `RECUE_DISABLE_DMABUF` (later: the persisted Settings mode).
    pub over: RendererOverride,
    /// Which NVIDIA kernel module is loaded.
    pub nvidia_kernel: NvidiaKernel,
    /// The NVIDIA driver version — diagnostics only, it never gates the decision.
    pub nvidia_version: Option<String>,
    /// One entry per `/sys/class/drm/cardN`.
    pub gpus: Vec<GpuClass>,
    /// The raw DRM driver names behind `gpus`, same order — diagnostics only.
    pub gpu_drivers: Vec<String>,
    /// GL was explicitly routed through the blob (`__GLX_VENDOR_LIBRARY_NAME=nvidia` or
    /// `__NV_PRIME_RENDER_OFFLOAD=1`).
    pub nvidia_gl_env: bool,
    /// Running inside a VM (the tightened [`vm_detected`]).
    pub vm: bool,
    /// `XDG_SESSION_TYPE` — diagnostics only.
    pub session_type: Option<String>,
}

/// The DMA-BUF verdict plus the evidence-naming reason printed at boot.
#[cfg(any(all(unix, not(target_os = "macos")), test))]
#[cfg_attr(test, allow(dead_code))]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct DmabufDecision {
    /// Export `WEBKIT_DISABLE_DMABUF_RENDERER=1`?
    pub disable: bool,
    /// Why — printed in the boot line, asserted in the tests.
    pub reason: &'static str,
}

/// Should `WEBKIT_DISABLE_DMABUF_RENDERER=1` be exported? Pure — see the module docs for
/// the ordered policy. The key rules are 4/5: we disable DMA-BUF only when nothing
/// **Mesa** can render the webview, so a hybrid iGPU+dGPU laptop keeps it (#347).
#[cfg(any(all(unix, not(target_os = "macos")), test))]
#[cfg_attr(test, allow(dead_code))]
pub(crate) fn decide_dmabuf(probe: &DmabufProbe) -> DmabufDecision {
    let keep = |reason| DmabufDecision {
        disable: false,
        reason,
    };
    let disable = |reason| DmabufDecision {
        disable: true,
        reason,
    };

    // 1. The user's own env always wins — we never touch the variable.
    if probe.user_set_dmabuf {
        return keep("WEBKIT_DISABLE_DMABUF_RENDERER already set by the user");
    }
    // 2. The explicit override (the env var today, a Settings mode later).
    match probe.over {
        RendererOverride::ForceDisable => return disable("RECUE_DISABLE_DMABUF forced on"),
        RendererOverride::ForceKeep => return keep("RECUE_DISABLE_DMABUF forced off"),
        RendererOverride::Auto => {}
    }

    let mesa = probe.gpus.contains(&GpuClass::Mesa);
    let blob = matches!(
        probe.nvidia_kernel,
        NvidiaKernel::Proprietary | NvidiaKernel::Open
    );

    // 3. GL explicitly routed through the blob (PRIME offload): the hybrid exemption does
    //    not apply — the webview's GL *is* NVIDIA's.
    if blob && probe.nvidia_gl_env {
        return disable("NVIDIA GL selected via env (PRIME offload)");
    }
    // 4. The blob is the only thing that can render it. An unreadable `/sys/class/drm`
    //    leaves `gpus` empty and lands here too — conservative, exactly as #346 was.
    if blob && !mesa {
        return disable("NVIDIA blob driver is the only renderer");
    }
    // 5. A VM whose GPUs are all virtual/unknown.
    if probe.vm && !mesa {
        return disable("virtual machine without a native Mesa GPU");
    }
    // 6. Mesa renders it (hybrid, nouveau, AMD/Intel, a passthrough VM) — DMA-BUF is the
    //    faster path, so leave it on. With no known-bad renderer at all we also keep it:
    //    DMA-BUF is WebKit's default and we only ever opt *out* of it.
    if mesa {
        keep("Mesa GPU present (healthy DMA-BUF)")
    } else {
        keep("no known-bad renderer detected")
    }
}

/// Parse a `RECUE_*` force flag: `1|true|on|yes` → `Some(true)`, `0|false|off|no` →
/// `Some(false)`, anything else (including unset) → `None` (no override).
#[cfg(any(all(unix, not(target_os = "macos")), test))]
#[cfg_attr(test, allow(dead_code))]
pub(crate) fn parse_force_flag(val: Option<&str>) -> Option<bool> {
    match val?.trim().to_ascii_lowercase().as_str() {
        "1" | "true" | "on" | "yes" => Some(true),
        "0" | "false" | "off" | "no" => Some(false),
        _ => None,
    }
}

/// Which NVIDIA kernel module is loaded, from the contents of
/// `/proc/driver/nvidia/version` (`None` when absent/unreadable/empty) and whether
/// `/sys/module/nvidia` exists.
///
/// nvidia-open identifies itself as an "Open Kernel Module"; anything else that produced
/// the node is the proprietary blob. A loaded module with an unreadable `/proc` node reads
/// as `Proprietary` (conservative — and it gates identically to `Open` anyway).
#[cfg(any(all(unix, not(target_os = "macos")), test))]
#[cfg_attr(test, allow(dead_code))]
pub(crate) fn nvidia_kernel_flavor(
    proc_version: Option<&str>,
    module_dir_exists: bool,
) -> NvidiaKernel {
    match proc_version.map(str::trim).filter(|s| !s.is_empty()) {
        Some(contents) if contents.to_ascii_lowercase().contains("open kernel module") => {
            NvidiaKernel::Open
        }
        Some(_) => NvidiaKernel::Proprietary,
        None if module_dir_exists => NvidiaKernel::Proprietary,
        None => NvidiaKernel::Absent,
    }
}

/// The NVIDIA driver version out of `/proc/driver/nvidia/version` — the first
/// whitespace-separated token that starts with a digit and contains a `.` (e.g.
/// `610.43.03`). **Diagnostics only**: the version never gates the decision (a wrong
/// threshold would mean a blank webview — worse than slow).
#[cfg(any(all(unix, not(target_os = "macos")), test))]
#[cfg_attr(test, allow(dead_code))]
pub(crate) fn nvidia_driver_version(proc_version: &str) -> Option<String> {
    proc_version
        .split_whitespace()
        .find(|tok| tok.starts_with(|c: char| c.is_ascii_digit()) && tok.contains('.'))
        .map(str::to_string)
}

/// Classify one `/sys/class/drm/cardN` from its DRM driver name and PCI vendor id
/// (`device/vendor`, the raw `0x…` string). The driver name decides; an unknown or
/// unreadable driver falls back to the vendor id.
#[cfg(any(all(unix, not(target_os = "macos")), test))]
#[cfg_attr(test, allow(dead_code))]
pub(crate) fn classify_gpu(driver: Option<&str>, vendor_id: Option<&str>) -> GpuClass {
    if let Some(driver) = driver {
        match driver.trim().to_ascii_lowercase().as_str() {
            "i915" | "xe" | "amdgpu" | "radeon" | "nouveau" | "v3d" | "vc4" | "panfrost"
            | "panthor" | "lima" | "msm" | "etnaviv" | "asahi" => return GpuClass::Mesa,
            "nvidia" | "nvidia-drm" => return GpuClass::NvidiaBlob,
            "virtio_gpu" | "virtio-gpu" | "vmwgfx" | "qxl" | "bochs-drm" | "cirrus"
            | "vboxvideo" | "hyperv_drm" | "vkms" | "simpledrm" | "simple-framebuffer" => {
                return GpuClass::Virtual
            }
            _ => {}
        }
    }
    // Vendor fallback. NVIDIA's `0x10de` deliberately stays `Unknown`: whether the blob is
    // in play is `nvidia_kernel_flavor`'s call, and a nouveau card reports `0x10de` too
    // (its *driver* name already classified it as Mesa above).
    match vendor_id.map(|v| v.trim().to_ascii_lowercase()).as_deref() {
        Some("0x8086" | "0x1002" | "0x1022") => GpuClass::Mesa,
        Some("0x1af4" | "0x15ad" | "0x1234" | "0x1414") => GpuClass::Virtual,
        _ => GpuClass::Unknown,
    }
}

/// True when every listed GPU is virtual (and there is at least one) — a VM signal.
#[cfg(any(all(unix, not(target_os = "macos")), test))]
#[cfg_attr(test, allow(dead_code))]
pub(crate) fn only_virtual_gpus(gpus: &[GpuClass]) -> bool {
    !gpus.is_empty() && gpus.iter().all(|g| *g == GpuClass::Virtual)
}

/// The independent signals the VM verdict is built from.
#[cfg(any(all(unix, not(target_os = "macos")), test))]
#[cfg_attr(test, allow(dead_code))]
#[derive(Debug, Clone, Default)]
pub(crate) struct VmSignals {
    /// The `hypervisor` CPUID flag in `/proc/cpuinfo`.
    pub cpu_hypervisor_flag: bool,
    /// `/sys/class/dmi/id/sys_vendor`.
    pub dmi_vendor: String,
    /// `/sys/class/dmi/id/product_name`.
    pub dmi_product: String,
    /// `/sys/hypervisor/type` exists (also true on a bare-metal Xen **dom0**).
    pub hypervisor_node: bool,
    /// `/proc/xen/capabilities` contains `control_d` — i.e. we *are* the Xen control
    /// domain, which is bare metal.
    pub xen_dom0: bool,
    /// Every `/sys/class/drm/cardN` is a virtual display device.
    pub only_virtual_gpus: bool,
}

/// True when the DMI vendor/product strings name a known hypervisor. **Exact** (trimmed,
/// ASCII-lowercased) comparisons — #346's substring matching read real hardware such as
/// `"PowerEdge KVM 1000"` as a VM.
#[cfg(any(all(unix, not(target_os = "macos")), test))]
#[cfg_attr(test, allow(dead_code))]
pub(crate) fn is_hypervisor_dmi(vendor: &str, product: &str) -> bool {
    const VM_VENDORS: [&str; 11] = [
        "qemu",
        "vmware, inc.",
        "innotek gmbh",
        "parallels software international inc.",
        "parallels international gmbh",
        "xen",
        "bochs",
        "amazon ec2",
        "alibaba cloud",
        "openstack foundation",
        "digitalocean",
    ];
    const VM_PRODUCTS: [&str; 9] = [
        "kvm",
        "kvm virtual machine",
        "virtualbox",
        "vmware virtual platform",
        "parallels virtual platform",
        "bochs",
        "hvm domu",
        "google compute engine",
        "openstack nova",
    ];

    let vendor = vendor.trim().to_ascii_lowercase();
    let product = product.trim().to_ascii_lowercase();

    if VM_VENDORS.contains(&vendor.as_str()) {
        return true;
    }
    // Hyper-V: a Surface reports "Microsoft Corporation" too, so the product is required.
    if vendor == "microsoft corporation" && product == "virtual machine" {
        return true;
    }
    // QEMU's stock machine names: "Standard PC (Q35 + ICH9, 2009)" / "Standard PC (i440FX …)".
    if product.starts_with("standard pc (") {
        return true;
    }
    // Parallels' guests are "Parallels Virtual Platform" / "Parallels ARM Virtual Machine".
    if product.starts_with("parallels ") && product.ends_with(" virtual machine") {
        return true;
    }
    VM_PRODUCTS.contains(&product.as_str())
}

/// The tightened VM verdict (#347): a Xen **control domain** is bare metal, and no single
/// signal is enough — the CPUID `hypervisor` flag needs corroboration (DMI / a hypervisor
/// node / an all-virtual GPU set), and a DMI hit alone needs an all-virtual GPU set.
#[cfg(any(all(unix, not(target_os = "macos")), test))]
#[cfg_attr(test, allow(dead_code))]
pub(crate) fn vm_detected(s: &VmSignals) -> bool {
    if s.xen_dom0 {
        return false;
    }
    let dmi = is_hypervisor_dmi(&s.dmi_vendor, &s.dmi_product);
    (s.cpu_hypervisor_flag && (dmi || s.hypervisor_node || s.only_virtual_gpus))
        || (dmi && s.only_virtual_gpus)
}

/// True when `/proc/cpuinfo` reports the CPUID `hypervisor` flag — a whitespace-delimited
/// token on a `flags`/`Features` line, never a substring of another flag.
#[cfg(any(all(unix, not(target_os = "macos")), test))]
#[cfg_attr(test, allow(dead_code))]
pub(crate) fn cpuinfo_has_hypervisor_flag(cpuinfo: &str) -> bool {
    cpuinfo.lines().any(|line| {
        let lower = line.to_ascii_lowercase();
        if !(lower.starts_with("flags") || lower.starts_with("features")) {
            return false;
        }
        lower
            .split(':')
            .nth(1)
            .is_some_and(|vals| vals.split_whitespace().any(|f| f == "hypervisor"))
    })
}

/// The evidence half of the boot line: what the probes actually saw.
#[cfg(any(all(unix, not(target_os = "macos")), test))]
#[cfg_attr(test, allow(dead_code))]
pub(crate) fn describe_probe(probe: &DmabufProbe) -> String {
    let gpus = if probe.gpus.is_empty() {
        "none".to_string()
    } else {
        probe
            .gpus
            .iter()
            .enumerate()
            .map(|(i, class)| {
                let driver = probe.gpu_drivers.get(i).map(String::as_str).unwrap_or("?");
                format!("{driver}[{}]", gpu_class_label(*class))
            })
            .collect::<Vec<_>>()
            .join(",")
    };
    let nvidia = match probe.nvidia_kernel {
        NvidiaKernel::Absent => "absent".to_string(),
        NvidiaKernel::Proprietary => nvidia_label("proprietary", probe.nvidia_version.as_deref()),
        NvidiaKernel::Open => nvidia_label("open", probe.nvidia_version.as_deref()),
    };
    format!(
        "gpus: {gpus}; nvidia: {nvidia}{}; vm: {}; session: {}",
        if probe.nvidia_gl_env {
            ", GL routed to nvidia"
        } else {
            ""
        },
        if probe.vm { "yes" } else { "no" },
        probe.session_type.as_deref().unwrap_or("unknown"),
    )
}

/// `"open 610.43.03"` / `"proprietary"` — the NVIDIA half of the boot line.
#[cfg(any(all(unix, not(target_os = "macos")), test))]
#[cfg_attr(test, allow(dead_code))]
fn nvidia_label(flavor: &str, version: Option<&str>) -> String {
    match version {
        Some(v) => format!("{flavor} {v}"),
        None => flavor.to_string(),
    }
}

/// The short label for a [`GpuClass`] in the boot line.
#[cfg(any(all(unix, not(target_os = "macos")), test))]
#[cfg_attr(test, allow(dead_code))]
fn gpu_class_label(class: GpuClass) -> &'static str {
    match class {
        GpuClass::Mesa => "mesa",
        GpuClass::NvidiaBlob => "blob",
        GpuClass::Virtual => "virtual",
        GpuClass::Unknown => "unknown",
    }
}

// ---------------------------------------------------------------------------
// The impure probes (Linux only, deliberately thin — all logic lives above)
// ---------------------------------------------------------------------------

/// Read a `/proc`/`/sys` file, trimmed; `None` when missing, unreadable, or empty.
#[cfg(all(unix, not(target_os = "macos")))]
fn read_trimmed(path: &std::path::Path) -> Option<String> {
    std::fs::read_to_string(path)
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

/// The renderer override in force. **Settings seam (#347):** a future persisted
/// `dmabufMode` setting is OR'd in here (the env var still winning). It must be readable
/// *before* `tauri::Builder` — GTK/WebKit read the env at init — so it would come from the
/// app-data `sessions.json` read directly rather than through `app.path()`.
#[cfg(all(unix, not(target_os = "macos")))]
fn resolve_override() -> RendererOverride {
    match parse_force_flag(std::env::var(RECUE_DMABUF_VAR).ok().as_deref()) {
        Some(true) => RendererOverride::ForceDisable,
        Some(false) => RendererOverride::ForceKeep,
        None => RendererOverride::Auto,
    }
}

/// The GPU inventory: one entry per `/sys/class/drm/cardN`, classified from its DRM driver
/// name + PCI vendor id. Returns the classes and, in the same order, the raw driver names
/// for the boot line.
#[cfg(all(unix, not(target_os = "macos")))]
fn probe_gpus() -> (Vec<GpuClass>, Vec<String>) {
    let Ok(entries) = std::fs::read_dir("/sys/class/drm") else {
        return (Vec::new(), Vec::new());
    };
    // `cardN` only — skip connector nodes like `card0-eDP-1`. Sorted so neither the log nor
    // the classification order depends on readdir order.
    let mut cards: Vec<_> = entries
        .flatten()
        .filter(|e| {
            let name = e.file_name();
            name.to_string_lossy()
                .strip_prefix("card")
                .is_some_and(|n| !n.is_empty() && n.chars().all(|c| c.is_ascii_digit()))
        })
        .map(|e| e.path())
        .collect();
    cards.sort();

    let mut classes = Vec::new();
    let mut drivers = Vec::new();
    for card in cards {
        let driver = std::fs::read_link(card.join("device/driver"))
            .ok()
            .and_then(|p| p.file_name().map(|n| n.to_string_lossy().into_owned()));
        let vendor = read_trimmed(&card.join("device/vendor"));
        classes.push(classify_gpu(driver.as_deref(), vendor.as_deref()));
        drivers.push(driver.unwrap_or_else(|| "?".to_string()));
    }
    (classes, drivers)
}

/// The NVIDIA kernel module's flavor + version (`/proc/driver/nvidia/version`,
/// `/sys/module/nvidia`).
#[cfg(all(unix, not(target_os = "macos")))]
fn probe_nvidia() -> (NvidiaKernel, Option<String>) {
    let proc_version = read_trimmed(std::path::Path::new("/proc/driver/nvidia/version"));
    let module_dir = std::path::Path::new("/sys/module/nvidia").exists();
    let flavor = nvidia_kernel_flavor(proc_version.as_deref(), module_dir);
    let version = proc_version.as_deref().and_then(nvidia_driver_version);
    (flavor, version)
}

/// GL explicitly routed through the NVIDIA blob (PRIME offload / GLVND vendor pick).
#[cfg(all(unix, not(target_os = "macos")))]
fn nvidia_gl_env() -> bool {
    let glvnd = std::env::var("__GLX_VENDOR_LIBRARY_NAME")
        .map(|v| v.trim().eq_ignore_ascii_case("nvidia"))
        .unwrap_or(false);
    let prime =
        parse_force_flag(std::env::var("__NV_PRIME_RENDER_OFFLOAD").ok().as_deref()) == Some(true);
    glvnd || prime
}

/// Best-effort VM detection from `/proc/cpuinfo`, DMI, the Xen nodes, and the GPU set.
/// Cheap file reads only — no shell-outs (no `systemd-detect-virt`).
#[cfg(all(unix, not(target_os = "macos")))]
fn probe_vm(gpus: &[GpuClass]) -> bool {
    let signals = VmSignals {
        cpu_hypervisor_flag: read_trimmed(std::path::Path::new("/proc/cpuinfo"))
            .is_some_and(|s| cpuinfo_has_hypervisor_flag(&s)),
        dmi_vendor: read_trimmed(std::path::Path::new("/sys/class/dmi/id/sys_vendor"))
            .unwrap_or_default(),
        dmi_product: read_trimmed(std::path::Path::new("/sys/class/dmi/id/product_name"))
            .unwrap_or_default(),
        hypervisor_node: std::path::Path::new("/sys/hypervisor/type").exists(),
        xen_dom0: read_trimmed(std::path::Path::new("/proc/xen/capabilities"))
            .is_some_and(|s| s.contains("control_d")),
        only_virtual_gpus: only_virtual_gpus(gpus),
    };
    vm_detected(&signals)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The reporter's `/proc/driver/nvidia/version`, verbatim (#347).
    const NVIDIA_OPEN_VERSION: &str = "NVRM version: NVIDIA UNIX Open Kernel Module for x86_64  610.43.03  Release Build  (root@archlinux)";
    const NVIDIA_PROPRIETARY_VERSION: &str =
        "NVRM version: NVIDIA UNIX x86_64 Kernel Module  550.135  Fri Jan 10 20:00:00 UTC 2025";

    fn probe(gpus: Vec<GpuClass>, nvidia_kernel: NvidiaKernel) -> DmabufProbe {
        let gpu_drivers = gpus
            .iter()
            .map(|c| gpu_class_label(*c).to_string())
            .collect();
        DmabufProbe {
            user_set_dmabuf: false,
            over: RendererOverride::Auto,
            nvidia_kernel,
            nvidia_version: None,
            gpus,
            gpu_drivers,
            nvidia_gl_env: false,
            vm: false,
            session_type: None,
        }
    }

    // --- the regression this task exists for -------------------------------------------

    #[test]
    fn hybrid_intel_nvidia_open_keeps_dmabuf() {
        // The reporter's Arch box: an RTX 4080 Max-Q on nvidia-open (card0) + an Intel Iris
        // Xe on i915 (card1), Hyprland/Wayland, bare metal. The webview renders on the
        // Intel iGPU through Mesa, where DMA-BUF is healthy — #346 disabled it anyway,
        // which *was* the reported slowness.
        let nvidia = nvidia_kernel_flavor(Some(NVIDIA_OPEN_VERSION), true);
        assert_eq!(nvidia, NvidiaKernel::Open);

        let probe = DmabufProbe {
            user_set_dmabuf: false,
            over: RendererOverride::Auto,
            nvidia_kernel: nvidia,
            nvidia_version: nvidia_driver_version(NVIDIA_OPEN_VERSION),
            gpus: vec![
                classify_gpu(Some("nvidia"), Some("0x10de")),
                classify_gpu(Some("i915"), Some("0x8086")),
            ],
            gpu_drivers: vec!["nvidia".into(), "i915".into()],
            nvidia_gl_env: false,
            vm: vm_detected(&VmSignals {
                cpu_hypervisor_flag: false,
                dmi_vendor: "ASUSTeK COMPUTER INC.".into(),
                dmi_product: "ROG Zephyrus M16 GU604VZ_GU604VZ".into(),
                hypervisor_node: false,
                xen_dom0: false,
                only_virtual_gpus: false,
            }),
            session_type: Some("wayland".into()),
        };
        assert_eq!(probe.gpus, vec![GpuClass::NvidiaBlob, GpuClass::Mesa]);
        assert!(!probe.vm, "a real ASUS laptop must not read as a VM");
        assert_eq!(probe.nvidia_version.as_deref(), Some("610.43.03"));

        let decision = decide_dmabuf(&probe);
        assert!(
            !decision.disable,
            "hybrid Intel+NVIDIA must keep DMA-BUF, got {decision:?}"
        );
        assert_eq!(decision.reason, "Mesa GPU present (healthy DMA-BUF)");
    }

    // --- decide_dmabuf ------------------------------------------------------------------

    #[test]
    fn nvidia_blob_only_still_disables() {
        for kernel in [NvidiaKernel::Proprietary, NvidiaKernel::Open] {
            let decision = decide_dmabuf(&probe(vec![GpuClass::NvidiaBlob], kernel));
            assert!(decision.disable, "{kernel:?} desktop must disable DMA-BUF");
            assert_eq!(decision.reason, "NVIDIA blob driver is the only renderer");
        }
    }

    #[test]
    fn unreadable_drm_dir_with_blob_stays_conservative() {
        // No /sys/class/drm entries at all → no evidence of a Mesa renderer → disable
        // (matching #346's behavior on that stack).
        assert!(decide_dmabuf(&probe(vec![], NvidiaKernel::Proprietary)).disable);
    }

    #[test]
    fn mesa_only_never_disables() {
        for driver in ["nouveau", "i915", "xe", "amdgpu", "radeon"] {
            let class = classify_gpu(Some(driver), None);
            assert_eq!(class, GpuClass::Mesa, "{driver}");
            let decision = decide_dmabuf(&probe(vec![class], NvidiaKernel::Absent));
            assert!(!decision.disable, "{driver} must keep DMA-BUF");
            assert_eq!(decision.reason, "Mesa GPU present (healthy DMA-BUF)");
        }
    }

    #[test]
    fn nvidia_gl_env_wins_over_the_hybrid_rule() {
        // The same hybrid box, but the user routed GL through the blob (PRIME offload) —
        // the webview's GL *is* NVIDIA's, so the workaround applies again.
        let mut p = probe(
            vec![GpuClass::NvidiaBlob, GpuClass::Mesa],
            NvidiaKernel::Proprietary,
        );
        assert!(!decide_dmabuf(&p).disable);
        p.nvidia_gl_env = true;
        let decision = decide_dmabuf(&p);
        assert!(decision.disable);
        assert_eq!(
            decision.reason,
            "NVIDIA GL selected via env (PRIME offload)"
        );

        // …but with no blob loaded the env signal is meaningless (nouveau + the var set).
        let mut p = probe(vec![GpuClass::Mesa], NvidiaKernel::Absent);
        p.nvidia_gl_env = true;
        assert!(!decide_dmabuf(&p).disable);
    }

    #[test]
    fn vm_with_passthrough_mesa_gpu_keeps_dmabuf() {
        let mut p = probe(vec![GpuClass::Mesa], NvidiaKernel::Absent);
        p.vm = true;
        assert!(!decide_dmabuf(&p).disable);
    }

    #[test]
    fn vm_with_only_virtual_gpus_disables() {
        let mut p = probe(vec![GpuClass::Virtual], NvidiaKernel::Absent);
        p.vm = true;
        let decision = decide_dmabuf(&p);
        assert!(decision.disable);
        assert_eq!(decision.reason, "virtual machine without a native Mesa GPU");
    }

    #[test]
    fn unknown_hardware_keeps_dmabuf_by_default() {
        // DMA-BUF is WebKit's default; we only ever opt *out* of it on known-bad stacks.
        let decision = decide_dmabuf(&probe(vec![GpuClass::Unknown], NvidiaKernel::Absent));
        assert!(!decision.disable);
        assert_eq!(decision.reason, "no known-bad renderer detected");
    }

    // --- the escape hatches --------------------------------------------------------------

    #[test]
    fn user_set_env_is_never_touched() {
        // A user-exported WEBKIT_DISABLE_DMABUF_RENDERER always wins — even against a force
        // flag or an NVIDIA-only box. `disable == false` means "we do not write the var".
        let mut p = probe(vec![GpuClass::NvidiaBlob], NvidiaKernel::Proprietary);
        p.user_set_dmabuf = true;
        let decision = decide_dmabuf(&p);
        assert!(!decision.disable);
        assert_eq!(
            decision.reason,
            "WEBKIT_DISABLE_DMABUF_RENDERER already set by the user"
        );

        p.over = RendererOverride::ForceDisable;
        assert!(!decide_dmabuf(&p).disable);
    }

    #[test]
    fn force_override_wins_both_ways() {
        // Force-on applies even on a healthy Intel Mesa stack…
        let mut p = probe(vec![GpuClass::Mesa], NvidiaKernel::Absent);
        p.over = RendererOverride::ForceDisable;
        let decision = decide_dmabuf(&p);
        assert!(decision.disable);
        assert_eq!(decision.reason, "RECUE_DISABLE_DMABUF forced on");

        // …and force-off suppresses the auto-detection on an NVIDIA-only box.
        let mut p = probe(vec![GpuClass::NvidiaBlob], NvidiaKernel::Proprietary);
        p.over = RendererOverride::ForceKeep;
        let decision = decide_dmabuf(&p);
        assert!(!decision.disable);
        assert_eq!(decision.reason, "RECUE_DISABLE_DMABUF forced off");
    }

    #[test]
    fn parse_force_flag_variants() {
        for on in ["1", "true", "on", "yes", "TRUE", " On ", "YES"] {
            assert_eq!(parse_force_flag(Some(on)), Some(true), "{on:?}");
        }
        for off in ["0", "false", "off", "no", "FALSE", " Off "] {
            assert_eq!(parse_force_flag(Some(off)), Some(false), "{off:?}");
        }
        for none in ["", "2", "maybe", "enable"] {
            assert_eq!(parse_force_flag(Some(none)), None, "{none:?}");
        }
        assert_eq!(parse_force_flag(None), None);
    }

    // --- the NVIDIA kernel module ---------------------------------------------------------

    #[test]
    fn nvidia_kernel_flavor_parsing() {
        assert_eq!(
            nvidia_kernel_flavor(Some(NVIDIA_OPEN_VERSION), true),
            NvidiaKernel::Open
        );
        assert_eq!(
            nvidia_kernel_flavor(Some(NVIDIA_PROPRIETARY_VERSION), true),
            NvidiaKernel::Proprietary
        );
        // Module loaded but /proc unreadable → assume the blob (it gates the same anyway).
        assert_eq!(nvidia_kernel_flavor(None, true), NvidiaKernel::Proprietary);
        assert_eq!(
            nvidia_kernel_flavor(Some("  "), true),
            NvidiaKernel::Proprietary
        );
        // Nothing at all (nouveau / AMD / Intel).
        assert_eq!(nvidia_kernel_flavor(None, false), NvidiaKernel::Absent);
        assert_eq!(nvidia_kernel_flavor(Some(""), false), NvidiaKernel::Absent);
    }

    #[test]
    fn nvidia_driver_version_parsing() {
        assert_eq!(
            nvidia_driver_version(NVIDIA_OPEN_VERSION).as_deref(),
            Some("610.43.03")
        );
        assert_eq!(
            nvidia_driver_version(NVIDIA_PROPRIETARY_VERSION).as_deref(),
            Some("550.135")
        );
        // No version-looking token → None (diagnostics only, it never gates the decision).
        assert_eq!(nvidia_driver_version("NVRM version: unknown"), None);
        assert_eq!(nvidia_driver_version(""), None);
    }

    // --- GPU classification -----------------------------------------------------------------

    #[test]
    fn classify_gpu_by_driver_name() {
        for mesa in [
            "i915", "xe", "amdgpu", "radeon", "nouveau", "v3d", "vc4", "panfrost", "panthor",
            "lima", "msm", "etnaviv", "asahi", "I915",
        ] {
            assert_eq!(classify_gpu(Some(mesa), None), GpuClass::Mesa, "{mesa}");
        }
        for blob in ["nvidia", "nvidia-drm"] {
            assert_eq!(
                classify_gpu(Some(blob), Some("0x10de")),
                GpuClass::NvidiaBlob,
                "{blob}"
            );
        }
        for virt in [
            "virtio_gpu",
            "virtio-gpu",
            "vmwgfx",
            "qxl",
            "bochs-drm",
            "cirrus",
            "vboxvideo",
            "hyperv_drm",
            "vkms",
            "simpledrm",
            "simple-framebuffer",
        ] {
            assert_eq!(classify_gpu(Some(virt), None), GpuClass::Virtual, "{virt}");
        }
    }

    #[test]
    fn classify_gpu_falls_back_to_pci_vendor() {
        assert_eq!(classify_gpu(None, Some("0x8086")), GpuClass::Mesa);
        assert_eq!(
            classify_gpu(Some("mystery"), Some("0x1002")),
            GpuClass::Mesa
        );
        assert_eq!(classify_gpu(None, Some("0x1022")), GpuClass::Mesa);
        for virt in ["0x1af4", "0x15ad", "0x1234", "0x1414"] {
            assert_eq!(classify_gpu(None, Some(virt)), GpuClass::Virtual, "{virt}");
        }
        // NVIDIA's vendor id alone says nothing about the driver in use (nouveau reports it
        // too) — the kernel-module flavor decides that.
        assert_eq!(classify_gpu(None, Some("0x10de")), GpuClass::Unknown);
        assert_eq!(classify_gpu(None, None), GpuClass::Unknown);
        assert_eq!(
            classify_gpu(Some("mystery"), Some("0xbeef")),
            GpuClass::Unknown
        );
    }

    #[test]
    fn only_virtual_gpus_needs_a_non_empty_all_virtual_set() {
        assert!(only_virtual_gpus(&[GpuClass::Virtual, GpuClass::Virtual]));
        assert!(!only_virtual_gpus(&[GpuClass::Virtual, GpuClass::Mesa]));
        assert!(!only_virtual_gpus(&[]));
    }

    // --- VM detection -------------------------------------------------------------------------

    fn guest(vendor: &str, product: &str) -> VmSignals {
        VmSignals {
            cpu_hypervisor_flag: true,
            dmi_vendor: vendor.into(),
            dmi_product: product.into(),
            hypervisor_node: false,
            xen_dom0: false,
            only_virtual_gpus: true,
        }
    }

    #[test]
    fn vm_detected_for_real_guests() {
        for (vendor, product) in [
            ("QEMU", "Standard PC (Q35 + ICH9, 2009)"),
            ("VMware, Inc.", "VMware Virtual Platform"),
            ("innotek GmbH", "VirtualBox"),
            ("Microsoft Corporation", "Virtual Machine"), // Hyper-V
            ("Xen", "HVM domU"),
            ("Amazon EC2", "t3.large"),
            ("Google", "Google Compute Engine"),
            (
                "Parallels International GmbH",
                "Parallels ARM Virtual Machine",
            ),
        ] {
            assert!(
                vm_detected(&guest(vendor, product)),
                "{vendor} / {product} should read as a VM"
            );
        }
    }

    #[test]
    fn vm_not_detected_on_bare_metal() {
        // A bare-metal Xen dom0: the hypervisor node exists (#346's misfire) but we are the
        // control domain — that is real hardware.
        assert!(!vm_detected(&VmSignals {
            cpu_hypervisor_flag: true,
            dmi_vendor: "Dell Inc.".into(),
            dmi_product: "PowerEdge R750".into(),
            hypervisor_node: true,
            xen_dom0: true,
            only_virtual_gpus: false,
        }));

        // Real hardware whose DMI merely *contains* a hypervisor word (#346's substring
        // matcher read the first two of these as VMs).
        for (vendor, product) in [
            ("Dell Inc.", "PowerEdge KVM 1000"),
            ("Supermicro", "Standard PC Server Board"),
            ("ASUSTeK COMPUTER INC.", "ROG Zephyrus M16 GU604VZ_GU604VZ"),
            ("LENOVO", "ThinkPad X1 Carbon Gen 11"),
            ("Micro-Star International Co., Ltd.", "MS-7C91"),
            ("", ""),
        ] {
            assert!(
                !vm_detected(&VmSignals {
                    cpu_hypervisor_flag: false,
                    dmi_vendor: vendor.into(),
                    dmi_product: product.into(),
                    ..VmSignals::default()
                }),
                "{vendor} / {product} should not read as a VM"
            );
        }
    }

    #[test]
    fn vm_detection_needs_two_independent_signals() {
        // The CPUID hypervisor flag alone (set by some bare-metal firmware / nested-virt
        // hosts) is not enough…
        assert!(!vm_detected(&VmSignals {
            cpu_hypervisor_flag: true,
            dmi_vendor: "ASUSTeK COMPUTER INC.".into(),
            dmi_product: "ROG Zephyrus M16 GU604VZ_GU604VZ".into(),
            ..VmSignals::default()
        }));
        // …and neither is a DMI hit alone.
        assert!(!vm_detected(&VmSignals {
            dmi_vendor: "QEMU".into(),
            dmi_product: "Standard PC (Q35 + ICH9, 2009)".into(),
            ..VmSignals::default()
        }));
        // DMI + an all-virtual GPU set is enough without the CPU flag.
        assert!(vm_detected(&VmSignals {
            dmi_vendor: "QEMU".into(),
            dmi_product: "Standard PC (Q35 + ICH9, 2009)".into(),
            only_virtual_gpus: true,
            ..VmSignals::default()
        }));
        // As is the CPU flag + a (non-dom0) hypervisor node.
        assert!(vm_detected(&VmSignals {
            cpu_hypervisor_flag: true,
            hypervisor_node: true,
            ..VmSignals::default()
        }));
    }

    #[test]
    fn is_hypervisor_dmi_matches_exactly() {
        assert!(is_hypervisor_dmi(
            "QEMU",
            "Standard PC (i440FX + PIIX, 1996)"
        ));
        assert!(is_hypervisor_dmi("Unknown", "KVM Virtual Machine"));
        assert!(is_hypervisor_dmi("  vmware, inc.  ", ""));
        assert!(is_hypervisor_dmi("Bochs", "Bochs"));
        // A Surface is not a Hyper-V guest (the vendor alone must not match).
        assert!(!is_hypervisor_dmi(
            "Microsoft Corporation",
            "Surface Laptop 5"
        ));
        // Substrings must not match (#346's bug).
        assert!(!is_hypervisor_dmi("Dell Inc.", "PowerEdge KVM 1000"));
        assert!(!is_hypervisor_dmi("Supermicro", "Standard PC Server Board"));
        assert!(!is_hypervisor_dmi("", ""));
    }

    #[test]
    fn cpuinfo_hypervisor_flag_is_token_matched() {
        let guest =
            "processor\t: 0\nvendor_id\t: GenuineIntel\nflags\t\t: fpu vme de hypervisor lahf_lm\n";
        assert!(cpuinfo_has_hypervisor_flag(guest));
        let arm = "processor\t: 0\nFeatures\t: fp asimd hypervisor\n";
        assert!(cpuinfo_has_hypervisor_flag(arm));

        let bare = "processor\t: 0\nflags\t\t: fpu vme de pse tsc msr pae mce cx8 apic\n";
        assert!(!cpuinfo_has_hypervisor_flag(bare));
        // A model name mentioning it is not the flag; nor is a longer flag containing it.
        assert!(!cpuinfo_has_hypervisor_flag(
            "model name\t: Hypervisor Test CPU\nflags\t\t: fpu hypervisor_x\n"
        ));
        assert!(!cpuinfo_has_hypervisor_flag(""));
    }

    // --- the boot line --------------------------------------------------------------------------

    #[test]
    fn describe_probe_names_the_evidence() {
        let mut p = probe(
            vec![GpuClass::NvidiaBlob, GpuClass::Mesa],
            NvidiaKernel::Open,
        );
        p.gpu_drivers = vec!["nvidia".into(), "i915".into()];
        p.nvidia_version = Some("610.43.03".into());
        p.session_type = Some("wayland".into());
        assert_eq!(
            describe_probe(&p),
            "gpus: nvidia[blob],i915[mesa]; nvidia: open 610.43.03; vm: no; session: wayland"
        );

        p.nvidia_gl_env = true;
        p.vm = true;
        assert!(describe_probe(&p).contains("GL routed to nvidia"));
        assert!(describe_probe(&p).contains("vm: yes"));

        // Nothing readable at all (an unreadable /sys, no NVIDIA, no session var).
        let empty = probe(vec![], NvidiaKernel::Absent);
        assert_eq!(
            describe_probe(&empty),
            "gpus: none; nvidia: absent; vm: no; session: unknown"
        );

        // The blob with no parseable version.
        let mut p = probe(vec![GpuClass::NvidiaBlob], NvidiaKernel::Proprietary);
        p.gpu_drivers = vec!["nvidia".into()];
        assert!(describe_probe(&p).contains("nvidia: proprietary;"));
    }

    // --- the impure probes (Linux only; read-only — they never touch the env) ------------------

    /// Every probe must be safe to run on *any* Linux box (a CI container has no
    /// `/sys/class/drm`, no NVIDIA, no DMI) — never panic, and stay self-consistent. The
    /// real hardware verdicts are covered by the pure tests above; this pins the thin I/O
    /// shell. `apply_webkit_env_workarounds` itself is not called here: it mutates the
    /// process env, which is only sound before any thread spawns (see its docs).
    #[cfg(all(unix, not(target_os = "macos")))]
    #[test]
    fn linux_probes_never_panic_and_stay_consistent() {
        use std::path::Path;

        let (classes, drivers) = probe_gpus();
        assert_eq!(
            classes.len(),
            drivers.len(),
            "every classified card keeps its driver name for the log"
        );

        let (flavor, version) = probe_nvidia();
        if flavor == NvidiaKernel::Absent {
            assert!(version.is_none(), "no module ⇒ no version");
        }

        // Read-only reads; the values depend on the host, we only assert they resolve.
        let vm = probe_vm(&classes);
        let gl_env = nvidia_gl_env();
        assert!(matches!(
            resolve_override(),
            RendererOverride::Auto | RendererOverride::ForceDisable | RendererOverride::ForceKeep
        ));
        assert!(read_trimmed(Path::new("/definitely/not/a/file")).is_none());

        // And the whole probe → decision path resolves to a reason string.
        let probe = DmabufProbe {
            user_set_dmabuf: false,
            over: resolve_override(),
            nvidia_kernel: flavor,
            nvidia_version: version,
            gpus: classes,
            gpu_drivers: drivers,
            nvidia_gl_env: gl_env,
            vm,
            session_type: std::env::var("XDG_SESSION_TYPE").ok(),
        };
        assert!(!decide_dmabuf(&probe).reason.is_empty());
        assert!(describe_probe(&probe).contains("gpus: "));
    }
}
