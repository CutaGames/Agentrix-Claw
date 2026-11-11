fn main() {
    // Reference list of app commands (used historically for permissions
    // doc generation; kept here for grep-ability). Marked allow(dead_code)
    // because tauri_build::build() consumes capability JSON, not this list.
    #[allow(dead_code)]
    const APP_COMMANDS: &[&str] = &[
        "desktop_bridge_open_chat_panel",
        "desktop_bridge_close_chat_panel",
        "desktop_bridge_set_ball_position",
        "desktop_bridge_get_ball_position",
        "desktop_bridge_set_panel_position_near_ball",
    ];

    tauri_build::build();
}
