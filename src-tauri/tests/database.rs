use classicomp_lib::database::Database;

#[test]
fn new_database_seeds_profiles_games_and_local_only_cloud_state() {
    let database = Database::open_memory().expect("database opens");
    let state = database.load_state().expect("state loads");

    assert_eq!(state.active_profile_id, "owner");
    assert_eq!(state.profiles.len(), 2);
    assert!(state.games.iter().any(|game| game.id == "openrct2"));
    assert_eq!(state.cloud_provider, None);
    assert!(state.downloads.is_empty());
    assert!(
        state.libraries["owner"]
            .iter()
            .all(|entry| entry.install_state == "available")
    );
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
    assert_eq!(state.route, "downloads");
}
