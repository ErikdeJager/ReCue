//! WebKitGTK renderer workarounds for Linux (#346).
//!
//! On NVIDIA's proprietary driver (and inside VMs), WebKitGTK's DMA-BUF renderer is
//! the classic "Tauri app is unusably slow / blank on Linux" failure: every frame
//! takes a broken or CPU-bound DMA-BUF path, dragging the whole webview down —
//! terminal input echo, painting, boot. The established fix is exporting
//! `WEBKIT_DISABLE_DMABUF_RENDERER=1` **before** GTK/WebKit initialize; wry (0.55)
//! does not set it, so ReCue must.
//!
//! Policy (the pure [`should_disable_dmabuf`], unit-tested on every host):
//! 1. A user-set `WEBKIT_DISABLE_DMABUF_RENDERER` (any value) is always respected.
//! 2. `RECUE_DISABLE_DMABUF=1|true|on|yes` forces the workaround on; `0|false|off|no`
//!    forces it off — the support escape hatches (see `TRAJECTORY_TO_LINUX.md`).
//! 3. Otherwise it is applied only where DMA-BUF is known-bad: the NVIDIA proprietary
//!    driver, or a VM. Healthy Mesa stacks (AMD/Intel) keep the default DMA-BUF
//!    renderer — disabling it there would *cost* performance.
//!
//! `WEBKIT_DISABLE_COMPOSITING_MODE` is never set automatically (it turns off
//! accelerated compositing wholesale); the opt-in `RECUE_DISABLE_COMPOSITING=1` is
//! honored for real-box debugging. Like `path_env`, the module compiles everywhere
//! and the real work is cfg-gated inside; pure decision helpers are widened with
//! `, test)` (the `reveal_file_linux` precedent) so the macOS host type-checks and
//! unit-tests them.

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
        let probe = WebkitEnvProbe {
            user_set_dmabuf: std::env::var_os(WEBKIT_DMABUF_VAR).is_some(),
            force: parse_force_flag(std::env::var(RECUE_DMABUF_VAR).ok().as_deref()),
            nvidia: nvidia_driver_present(),
            vm: vm_detected(),
        };
        if should_disable_dmabuf(&probe) {
            std::env::set_var(WEBKIT_DMABUF_VAR, "1");
            eprintln!(
                "[recue] WebKitGTK: set {WEBKIT_DMABUF_VAR}=1 (nvidia: {}, vm: {}, forced: {}) — override with {RECUE_DMABUF_VAR}=0",
                probe.nvidia,
                probe.vm,
                probe.force.is_some(),
            );
        }
        // Debug-only opt-in; respect a user-set value like the DMA-BUF var above.
        if parse_force_flag(std::env::var(RECUE_COMPOSITING_VAR).ok().as_deref()) == Some(true)
            && std::env::var_os(WEBKIT_COMPOSITING_VAR).is_none()
        {
            std::env::set_var(WEBKIT_COMPOSITING_VAR, "1");
            eprintln!("[recue] WebKitGTK: set {WEBKIT_COMPOSITING_VAR}=1 ({RECUE_COMPOSITING_VAR} opt-in)");
        }
    }
}

/// What the environment/hardware probes saw — the input to the pure decision.
#[cfg(any(all(unix, not(target_os = "macos")), test))]
#[cfg_attr(test, allow(dead_code))]
pub(crate) struct WebkitEnvProbe {
    /// The user already exported `WEBKIT_DISABLE_DMABUF_RENDERER` themselves.
    pub user_set_dmabuf: bool,
    /// Parsed `RECUE_DISABLE_DMABUF` override, if any.
    pub force: Option<bool>,
    /// NVIDIA proprietary kernel driver detected.
    pub nvidia: bool,
    /// Running inside a VM.
    pub vm: bool,
}

/// The DMA-BUF decision: respect the user's own env first, then the `RECUE_*` force
/// override, then auto-apply only on the known-bad stacks (NVIDIA proprietary / VM).
#[cfg(any(all(unix, not(target_os = "macos")), test))]
#[cfg_attr(test, allow(dead_code))]
pub(crate) fn should_disable_dmabuf(probe: &WebkitEnvProbe) -> bool {
    if probe.user_set_dmabuf {
        return false;
    }
    if let Some(force) = probe.force {
        return force;
    }
    probe.nvidia || probe.vm
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

/// True when a DMI `product_name` / `sys_vendor` string names a known hypervisor.
/// ("Standard PC …" is QEMU's stock machine name.)
#[cfg(any(all(unix, not(target_os = "macos")), test))]
#[cfg_attr(test, allow(dead_code))]
pub(crate) fn is_vm_product_name(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    [
        "vmware",
        "virtualbox",
        "qemu",
        "kvm",
        "virtual machine",
        "parallels",
        "bochs",
        "standard pc",
    ]
    .iter()
    .any(|marker| lower.contains(marker))
}

/// NVIDIA proprietary kernel driver present? (Mesa/nouveau does not create these.)
#[cfg(all(unix, not(target_os = "macos")))]
fn nvidia_driver_present() -> bool {
    std::path::Path::new("/proc/driver/nvidia/version").exists()
        || std::path::Path::new("/sys/module/nvidia").exists()
}

/// Best-effort VM detection: a Xen-style hypervisor node, or a DMI product/vendor
/// string naming a known hypervisor. Cheap file reads only — no shell-outs.
#[cfg(all(unix, not(target_os = "macos")))]
fn vm_detected() -> bool {
    if std::path::Path::new("/sys/hypervisor/type").exists() {
        return true;
    }
    [
        "/sys/class/dmi/id/product_name",
        "/sys/class/dmi/id/sys_vendor",
    ]
    .iter()
    .any(|path| {
        std::fs::read_to_string(path)
            .map(|s| is_vm_product_name(&s))
            .unwrap_or(false)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn probe(user_set: bool, force: Option<bool>, nvidia: bool, vm: bool) -> WebkitEnvProbe {
        WebkitEnvProbe {
            user_set_dmabuf: user_set,
            force,
            nvidia,
            vm,
        }
    }

    #[test]
    fn dmabuf_decision_respects_user_set_env() {
        // A user-exported WEBKIT_DISABLE_DMABUF_RENDERER always wins — even against a
        // force flag or an NVIDIA/VM detection.
        assert!(!should_disable_dmabuf(&probe(true, None, true, true)));
        assert!(!should_disable_dmabuf(&probe(true, Some(true), true, true)));
    }

    #[test]
    fn dmabuf_decision_force_override_wins_both_ways() {
        // Force-on applies even on a healthy AMD/Intel stack…
        assert!(should_disable_dmabuf(&probe(
            false,
            Some(true),
            false,
            false
        )));
        // …and force-off suppresses the NVIDIA/VM auto-detection.
        assert!(!should_disable_dmabuf(&probe(
            false,
            Some(false),
            true,
            true
        )));
    }

    #[test]
    fn dmabuf_decision_auto_on_nvidia() {
        assert!(should_disable_dmabuf(&probe(false, None, true, false)));
    }

    #[test]
    fn dmabuf_decision_auto_on_vm() {
        assert!(should_disable_dmabuf(&probe(false, None, false, true)));
    }

    #[test]
    fn dmabuf_decision_off_by_default_on_amd_intel() {
        // No user env, no force, no NVIDIA, no VM → leave DMA-BUF on (disabling it on
        // a healthy Mesa stack would cost performance).
        assert!(!should_disable_dmabuf(&probe(false, None, false, false)));
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

    #[test]
    fn is_vm_product_name_matches_known_hypervisors() {
        for vm in [
            "VMware Virtual Platform",
            "VirtualBox",
            "QEMU Virtual Machine",
            "Standard PC (Q35 + ICH9, 2009)",
            "KVM",
            "Virtual Machine", // Hyper-V
            "Parallels Virtual Platform",
        ] {
            assert!(is_vm_product_name(vm), "{vm:?} should read as a VM");
        }
        for real in [
            "ThinkPad X1 Carbon Gen 11",
            "ROG Strix B550-F GAMING",
            "MS-7C91",
            "",
        ] {
            assert!(
                !is_vm_product_name(real),
                "{real:?} should not read as a VM"
            );
        }
    }
}
