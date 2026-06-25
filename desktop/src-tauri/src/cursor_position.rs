//! Cursor position polling — used by the pet companion to look at where
//! the mouse is. Cheap (~1 syscall) so we can poll at 10-20 Hz from JS.

use enigo::{Enigo, Mouse, Settings};

#[derive(serde::Serialize)]
pub struct CursorPosition {
    pub x: i32,
    pub y: i32,
}

#[tauri::command]
pub fn desktop_pet_get_cursor_position() -> Result<CursorPosition, String> {
    let enigo = Enigo::new(&Settings::default())
        .map_err(|e| format!("enigo init failed: {e}"))?;
    let (x, y) = enigo.location().map_err(|e| format!("cursor location: {e}"))?;
    Ok(CursorPosition { x, y })
}
