pub mod database;

#[cfg(feature = "desktop")]
use std::sync::Mutex;

#[cfg(feature = "desktop")]
use database::{AppState, Database, Game, TrackedProject, TrackedProjectUpdate};

#[cfg(feature = "desktop")]
#[tauri::command]
fn load_state(database: tauri::State<'_, Mutex<Database>>) -> Result<AppState, String> {
    database
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?
        .load_state()
        .map_err(|error| error.to_string())
}

#[cfg(feature = "desktop")]
#[tauri::command]
fn set_active_profile(
    profile_id: String,
    database: tauri::State<'_, Mutex<Database>>,
) -> Result<AppState, String> {
    let database = database
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    database
        .set_active_profile(&profile_id)
        .and_then(|_| database.load_state())
        .map_err(|error| error.to_string())
}

#[cfg(feature = "desktop")]
#[tauri::command]
fn sign_out(database: tauri::State<'_, Mutex<Database>>) -> Result<AppState, String> {
    let database = database
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    database
        .sign_out()
        .and_then(|_| database.load_state())
        .map_err(|error| error.to_string())
}

#[cfg(feature = "desktop")]
#[tauri::command]
fn queue_install(
    game_id: String,
    game: Option<Game>,
    database: tauri::State<'_, Mutex<Database>>,
) -> Result<AppState, String> {
    let database = database
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    let active_profile_id = database
        .load_state()
        .map_err(|error| error.to_string())?
        .active_profile_id
        .ok_or("not signed in".to_string())?;
    database
        .queue_install_with_game(&active_profile_id, &game_id, game.as_ref())
        .and_then(|_| database.load_state())
        .map_err(|error| error.to_string())
}

#[cfg(feature = "desktop")]
#[tauri::command]
fn uninstall_game(
    game_id: String,
    database: tauri::State<'_, Mutex<Database>>,
) -> Result<AppState, String> {
    let database = database
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    let active_profile_id = database
        .load_state()
        .map_err(|error| error.to_string())?
        .active_profile_id
        .ok_or("not signed in".to_string())?;
    database
        .uninstall_game(&active_profile_id, &game_id)
        .and_then(|_| database.load_state())
        .map_err(|error| error.to_string())
}

#[cfg(feature = "desktop")]
#[tauri::command]
fn set_game_rom(
    game_id: String,
    rom_path: Option<String>,
    database: tauri::State<'_, Mutex<Database>>,
) -> Result<AppState, String> {
    let database = database
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    let active_profile_id = database
        .load_state()
        .map_err(|error| error.to_string())?
        .active_profile_id
        .ok_or("not signed in".to_string())?;
    database
        .set_game_rom(&active_profile_id, &game_id, rom_path.as_deref())
        .and_then(|_| database.load_state())
        .map_err(|error| error.to_string())
}

#[cfg(feature = "desktop")]
#[tauri::command]
fn set_game_installed(
    game_id: String,
    launch_target: String,
    installed_version: Option<String>,
    database: tauri::State<'_, Mutex<Database>>,
) -> Result<AppState, String> {
    let database = database
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    let active_profile_id = database
        .load_state()
        .map_err(|error| error.to_string())?
        .active_profile_id
        .ok_or("not signed in".to_string())?;
    database
        .set_game_installed(&active_profile_id, &game_id, &launch_target, installed_version.as_deref())
        .and_then(|_| database.load_state())
        .map_err(|error| error.to_string())
}

#[cfg(feature = "desktop")]
#[tauri::command]
fn set_download_state(
    download_id: String,
    state: String,
    progress: Option<i64>,
    database: tauri::State<'_, Mutex<Database>>,
) -> Result<AppState, String> {
    let database = database
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    database
        .set_download_state(&download_id, &state, progress)
        .and_then(|_| database.load_state())
        .map_err(|error| error.to_string())
}

#[cfg(feature = "desktop")]
#[tauri::command]
fn toggle_mod(
    mod_id: String,
    database: tauri::State<'_, Mutex<Database>>,
) -> Result<AppState, String> {
    let database = database
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    let active_profile_id = database
        .load_state()
        .map_err(|error| error.to_string())?
        .active_profile_id
        .ok_or("not signed in".to_string())?;
    database
        .toggle_mod(&active_profile_id, &mod_id)
        .and_then(|_| database.load_state())
        .map_err(|error| error.to_string())
}

#[cfg(feature = "desktop")]
#[tauri::command]
fn toggle_watch(
    game_key: String,
    database: tauri::State<'_, Mutex<Database>>,
) -> Result<AppState, String> {
    let database = database
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    let active_profile_id = database
        .load_state()
        .map_err(|error| error.to_string())?
        .active_profile_id
        .ok_or("not signed in".to_string())?;
    database
        .toggle_watch(&active_profile_id, &game_key)
        .and_then(|_| database.load_state())
        .map_err(|error| error.to_string())
}

#[cfg(feature = "desktop")]
#[tauri::command]
fn apply_tracking_updates(
    updates: Vec<TrackedProjectUpdate>,
    scanned_at: String,
    database: tauri::State<'_, Mutex<Database>>,
) -> Result<AppState, String> {
    let database = database
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    database
        .apply_tracking_updates(&updates, &scanned_at)
        .and_then(|_| database.load_state())
        .map_err(|error| error.to_string())
}

#[cfg(feature = "desktop")]
#[tauri::command]
fn dismiss_notice(
    notice_id: String,
    database: tauri::State<'_, Mutex<Database>>,
) -> Result<AppState, String> {
    let database = database
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    database
        .dismiss_notice(&notice_id)
        .and_then(|_| database.load_state())
        .map_err(|error| error.to_string())
}

#[cfg(feature = "desktop")]
#[tauri::command]
fn add_tracked_projects(
    projects: Vec<TrackedProject>,
    database: tauri::State<'_, Mutex<Database>>,
) -> Result<AppState, String> {
    let database = database
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    database
        .add_tracked_projects(&projects)
        .and_then(|_| database.load_state())
        .map_err(|error| error.to_string())
}

#[cfg(feature = "desktop")]
pub fn run() {
    use tauri::Manager;

    tauri::Builder::default()
        .setup(|app| {
            let app_data = app
                .path()
                .app_data_dir()
                .map_err(|error| format!("failed to resolve app data dir: {error}"))?;
            std::fs::create_dir_all(&app_data)
                .map_err(|error| format!("failed to create app data dir: {error}"))?;
            let database = Database::open(app_data.join("classicomp.sqlite3"))
                .map_err(|error| format!("failed to open database: {error}"))?;
            app.manage(Mutex::new(database));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_state,
            set_active_profile,
            sign_out,
            queue_install,
            uninstall_game,
            set_game_rom,
            set_game_installed,
            set_download_state,
            toggle_mod,
            toggle_watch,
            apply_tracking_updates,
            dismiss_notice,
            add_tracked_projects
        ])
        .run(tauri::generate_context!())
        .expect("error while running Classicomp");
}
