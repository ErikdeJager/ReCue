import { lazy, type ReactNode, Suspense } from "react";

import { useStore } from "../store";

// Every top-level modal, deferred into its own chunk (#356). None of them is on the
// first-paint path — the app paints the sidebar + terminals, and a modal only exists once
// the user asks for it — yet statically they were ~85 kB of the entry chunk (NewSessionModal
// 20.6, Settings 17.9 + its markdown-rendered patch notes, GlobalSearch 8.3, TemplateEditor
// 7.5, CreatePanelModal 5.9, …). `src/prefetch.ts` warms the common ones on idle, so by the
// time the user hits ⌘/Ctrl+N or the gear the chunk is already in memory.
//
// NOT here (deliberately static, see MainApp): Toaster, BigModeModal, UpdateModal,
// ClaudeMissing — first-paint or safety-critical (the update install overlay must never be
// a chunk away). The EditorPicker gate is additionally exported — a detached canvas
// window (#84) renders it too (its agent headers carry the same ⋯ menu).
const CanvasCloseModal = lazy(
  () => import("./CanvasCloseModal/CanvasCloseModal"),
);
const CloneRepoModal = lazy(() => import("./CloneRepoModal/CloneRepoModal"));
const CreatePanelModal = lazy(
  () => import("./CreatePanelModal/CreatePanelModal"),
);
const EditorPickerModal = lazy(
  () => import("./EditorPicker/EditorPickerModal"),
);
const GlobalSearch = lazy(() => import("./GlobalSearch/GlobalSearch"));
const NewSessionModal = lazy(() => import("./NewSessionModal/NewSessionModal"));
const OnboardingModal = lazy(() => import("./Onboarding/OnboardingModal"));
const Settings = lazy(() => import("./Settings/Settings"));
const TemplateEditor = lazy(() => import("./TemplateEditor/TemplateEditor"));
const TemplateManager = lazy(() => import("./TemplateManager/TemplateManager"));
const TemplateUseModal = lazy(
  () => import("./TemplateUseModal/TemplateUseModal"),
);

/**
 * Mount a modal only while it is open, and show **nothing** (not an empty modal shell)
 * while its chunk is in flight — hence the `null` Suspense fallback.
 */
function Gate({ open, children }: { open: boolean; children: ReactNode }) {
  if (!open) return null;
  return <Suspense fallback={null}>{children}</Suspense>;
}

// One gate component per modal, each subscribing to its own store flag: opening a modal
// re-renders only its gate, never the whole `MainApp` shell (a small bonus win).

function SettingsGate() {
  const open = useStore((s) => s.settingsOpen);
  return (
    <Gate open={open}>
      <Settings />
    </Gate>
  );
}

function NewSessionGate() {
  const open = useStore((s) => s.newSessionOpen);
  return (
    <Gate open={open}>
      <NewSessionModal />
    </Gate>
  );
}

function CloneRepoGate() {
  const open = useStore((s) => s.cloneRepoOpen);
  return (
    <Gate open={open}>
      <CloneRepoModal />
    </Gate>
  );
}

function CreatePanelGate() {
  const open = useStore((s) => s.createPanelOpen);
  return (
    <Gate open={open}>
      <CreatePanelModal />
    </Gate>
  );
}

function GlobalSearchGate() {
  const open = useStore((s) => s.globalSearchOpen);
  return (
    <Gate open={open}>
      <GlobalSearch />
    </Gate>
  );
}

function CanvasCloseGate() {
  const open = useStore((s) => s.canvasClosePromptId !== null);
  return (
    <Gate open={open}>
      <CanvasCloseModal />
    </Gate>
  );
}

function TemplateUseGate() {
  const open = useStore((s) => s.templateUseOpen);
  return (
    <Gate open={open}>
      <TemplateUseModal />
    </Gate>
  );
}

function TemplateManagerGate() {
  const open = useStore((s) => s.templateManagerOpen);
  return (
    <Gate open={open}>
      <TemplateManager />
    </Gate>
  );
}

function TemplateEditorGate() {
  const open = useStore((s) => s.templateEditorOpen);
  return (
    <Gate open={open}>
      <TemplateEditor />
    </Gate>
  );
}

function OnboardingGate() {
  const open = useStore((s) => s.onboardingOpen);
  return (
    <Gate open={open}>
      <OnboardingModal />
    </Gate>
  );
}

/** The "Open in editor" picker gate — exported because it also mounts in detached
 * canvas windows (#84): their agent headers carry the same ⋯ menu and the
 * open/choose-editor chords work there, so the picker must exist per window. */
export function EditorPickerGate() {
  const open = useStore((s) => s.editorPickerOpen);
  return (
    <Gate open={open}>
      <EditorPickerModal />
    </Gate>
  );
}

/** All of the main window's lazy modals, each mounted only while its store flag is set. */
function ModalHost() {
  return (
    <>
      <NewSessionGate />
      <CloneRepoGate />
      <CreatePanelGate />
      <GlobalSearchGate />
      <SettingsGate />
      <CanvasCloseGate />
      <TemplateUseGate />
      <TemplateManagerGate />
      <TemplateEditorGate />
      <OnboardingGate />
      <EditorPickerGate />
    </>
  );
}

export default ModalHost;
