use classicomp_lib::database::Database;

#[test]
fn new_database_seeds_profiles_games_tags_mods_and_local_only_cloud_state() {
    let database = Database::open_memory().expect("database opens");
    let state = database.load_state().expect("state loads");

    assert_eq!(state.active_profile_id, Some("owner".to_string()));
    assert_eq!(state.profiles.len(), 2);
    assert_eq!(state.cloud_provider, None);
    assert!(state.downloads.is_empty());
    assert!(
        state.libraries["owner"]
            .iter()
            .all(|entry| entry.install_state == "available")
    );

    let openrct2 = state
        .games
        .iter()
        .find(|game| game.id == "openrct2")
        .expect("openrct2 exists");
    assert!(openrct2.tags.contains(&"Simulation".to_string()));
    assert!(openrct2.tags.contains(&"Strategy".to_string()));

    let tamriel = state.mods["owner"]
        .iter()
        .find(|module| module.id == "mod-openmw-tamriel-rebuilt")
        .expect("seed mod exists");
    assert!(tamriel.enabled);
    assert!(state.mods["guest"].iter().all(|module| !module.enabled));
}

#[test]
fn queue_install_persists_library_entry_and_download_without_duplicates() {
    let database = Database::open_memory().expect("database opens");

    database
        .queue_install("owner", "devilutionx")
        .expect("install queues");
    database
        .queue_install("owner", "devilutionx")
        .expect("second queue is idempotent");

    let state = database.load_state().expect("state loads");
    let owner_library = &state.libraries["owner"];
    let entry = owner_library
        .iter()
        .find(|entry| entry.game_id == "devilutionx")
        .expect("devilutionx library entry exists");

    assert_eq!(entry.install_state, "queued");
    assert_eq!(state.downloads.len(), 1);
    assert_eq!(state.downloads[0].game_id, "devilutionx");
    assert_eq!(state.route, "library");
}

#[test]
fn sign_out_clears_the_active_profile_until_one_is_activated() {
    let database = Database::open_memory().expect("database opens");

    database.sign_out().expect("sign out works");
    let state = database.load_state().expect("state loads");
    assert_eq!(state.active_profile_id, None);
    assert!(state.downloads.is_empty());
    assert!(state.save_snapshots.is_empty());

    database.set_active_profile("guest").expect("sign in works");
    let state = database.load_state().expect("state loads");
    assert_eq!(state.active_profile_id, Some("guest".to_string()));
}

#[test]
fn toggle_mod_flips_enabled_state_for_one_profile_only() {
    let database = Database::open_memory().expect("database opens");

    database
        .toggle_mod("owner", "mod-openmw-rebirth")
        .expect("toggle works");
    let state = database.load_state().expect("state loads");
    assert!(
        state.mods["owner"]
            .iter()
            .find(|module| module.id == "mod-openmw-rebirth")
            .expect("mod exists")
            .enabled
    );
    assert!(
        !state.mods["guest"]
            .iter()
            .find(|module| module.id == "mod-openmw-rebirth")
            .expect("mod exists")
            .enabled
    );

    database
        .toggle_mod("owner", "mod-openmw-rebirth")
        .expect("second toggle works");
    let state = database.load_state().expect("state loads");
    assert!(
        !state.mods["owner"]
            .iter()
            .find(|module| module.id == "mod-openmw-rebirth")
            .expect("mod exists")
            .enabled
    );
}
