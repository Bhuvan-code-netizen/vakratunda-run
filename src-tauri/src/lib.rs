//! The desktop shell for Vakratunda Run.
//!
//! It does no work beyond hosting the web view, on purpose. Every system in the
//! game — the renderer, the physics, the audio, the effects — lives in the Vite
//! build, so the desktop app and the browser preview can never drift apart.

/// Start the desktop app.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Vakratunda Run");
}
