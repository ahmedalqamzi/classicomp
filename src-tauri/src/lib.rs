pub mod database;

#[cfg(feature = "desktop")]
use std::sync::Mutex;

#[cfg(feature = "desktop")]
use database::{AppState, Database};

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
fn queue_install(
    game_id: String,
    database: tauri::State<'_, Mutex<Database>>,
) -> Result<AppState, String> {
    let database = database
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    let active_profile_id = database
        .load_state()
        .map_err(|error| error.to_string())?
        .active_profile_id;
    database
        .queue_install(&active_profile_id, &game_id)
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
            queue_install
        ])
        .run(tauri::generate_context!())
        .expect("error while running Classicomp");
}
