use classicomp_lib::database::Database;

fn cover_update(
    id: &str,
    cover_url: Option<&str>,
    cover_aspect: Option<f64>,
    cover_checked: bool,
) -> classicomp_lib::database::TrackedProjectUpdate {
    classicomp_lib::database::TrackedProjectUpdate {
        id: id.to_string(),
        latest_version: None,
        last_activity_at: None,
        development_state: None,
        download_url: None,
        description: None,
        cover_url: cover_url.map(str::to_string),
        cover_aspect,
        cover_checked,
        topics: None,
        screenshots: None,
        recent_releases: None,
        download_assets: None,
        checked_at: None,
    }
}

fn version_update(
    id: &str,
    version: &str,
    download_url: Option<&str>,
) -> classicomp_lib::database::TrackedProjectUpdate {
    classicomp_lib::database::TrackedProjectUpdate {
        id: id.to_string(),
        latest_version: Some(version.to_string()),
        last_activity_at: None,
        development_state: None,
        download_url: download_url.map(str::to_string),
        description: None,
        cover_url: None,
        cover_aspect: None,
        cover_checked: false,
        topics: None,
        screenshots: None,
        recent_releases: None,
        download_assets: None,
        checked_at: None,
    }
}

#[test]
fn tracking_update_serializes_cover_scan_state() {
    use classicomp_lib::database::TrackedProjectUpdate;

    let update: TrackedProjectUpdate = serde_json::from_value(serde_json::json!({
        "id": "cover-contract",
        "coverUrl": "https://example.com/cover.jpg",
        "coverAspect": 1.5,
        "coverChecked": true
    }))
    .expect("tracking update deserializes");
    let serialized = serde_json::to_value(update).expect("tracking update serializes");

    assert_eq!(serialized["coverAspect"], 1.5);
    assert_eq!(serialized["coverChecked"], true);
}

#[test]
fn cover_checked_with_values_replaces_the_stored_cover_pair() {
    let database = Database::open_memory().expect("database opens");

    database
        .apply_tracking_updates(
            &[cover_update(
                "zelda64-recompiled",
                Some("https://example.com/replacement-cover.jpg"),
                Some(1.25),
                true,
            )],
            "2026-08-14T12:00:00Z",
        )
        .expect("cover replacement applies");

    let state = database.load_state().expect("state loads");
    let project = state
        .tracked_projects
        .iter()
        .find(|project| project.id == "zelda64-recompiled")
        .expect("tracked project exists");
    assert_eq!(
        project.cover_url.as_deref(),
        Some("https://example.com/replacement-cover.jpg")
    );
    assert_eq!(project.cover_aspect, Some(1.25));
}

#[test]
fn cover_checked_with_nulls_clears_the_stored_cover_pair() {
    let database = Database::open_memory().expect("database opens");
    database
        .apply_tracking_updates(
            &[cover_update(
                "zelda64-recompiled",
                Some("https://example.com/existing-cover.jpg"),
                Some(1.5),
                true,
            )],
            "2026-08-14T11:00:00Z",
        )
        .expect("existing cover is stored");

    database
        .apply_tracking_updates(
            &[cover_update("zelda64-recompiled", None, None, true)],
            "2026-08-14T12:00:00Z",
        )
        .expect("cover clear applies");

    let state = database.load_state().expect("state loads");
    let project = state
        .tracked_projects
        .iter()
        .find(|project| project.id == "zelda64-recompiled")
        .expect("tracked project exists");
    assert_eq!(project.cover_url, None);
    assert_eq!(project.cover_aspect, None);
}

#[test]
fn unchecked_cover_evidence_preserves_the_stored_cover_pair() {
    let database = Database::open_memory().expect("database opens");
    database
        .apply_tracking_updates(
            &[cover_update(
                "zelda64-recompiled",
                Some("https://example.com/existing-cover.jpg"),
                Some(1.5),
                true,
            )],
            "2026-08-14T11:00:00Z",
        )
        .expect("existing cover is stored");

    database
        .apply_tracking_updates(
            &[cover_update(
                "zelda64-recompiled",
                Some("https://example.com/ignored-cover.jpg"),
                Some(0.75),
                false,
            )],
            "2026-08-14T12:00:00Z",
        )
        .expect("unchecked evidence is ignored");

    let state = database.load_state().expect("state loads");
    let project = state
        .tracked_projects
        .iter()
        .find(|project| project.id == "zelda64-recompiled")
        .expect("tracked project exists");
    assert_eq!(
        project.cover_url.as_deref(),
        Some("https://example.com/existing-cover.jpg")
    );
    assert_eq!(project.cover_aspect, Some(1.5));
}

#[test]
fn new_database_seeds_profiles_games_tags_mods_and_an_empty_library() {
    let database = Database::open_memory().expect("database opens");
    let state = database.load_state().expect("state loads");

    assert_eq!(state.active_profile_id, Some("owner".to_string()));
    assert_eq!(state.profiles.len(), 2);
    assert_eq!(state.cloud_provider, None);
    assert!(state.downloads.is_empty());
    // Accounts start empty; games enter the library through store downloads.
    assert!(state.libraries.values().all(|entries| entries.is_empty()));

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
    assert_eq!(state.route, "store");
}

#[test]
fn uninstall_game_removes_the_library_entry_and_download() {
    let database = Database::open_memory().expect("database opens");
    database
        .queue_install("owner", "devilutionx")
        .expect("install queues");

    database
        .uninstall_game("owner", "devilutionx")
        .expect("game uninstalls");

    let state = database.load_state().expect("state loads");
    assert!(
        state
            .libraries
            .get("owner")
            .into_iter()
            .flatten()
            .all(|entry| entry.game_id != "devilutionx")
    );
    assert!(
        state
            .downloads
            .iter()
            .all(|download| download.game_id != "devilutionx")
    );
}

#[test]
fn uninstalling_a_game_not_in_the_library_is_an_ok_no_op() {
    let database = Database::open_memory().expect("database opens");
    let before = database.load_state().expect("initial state loads");

    database
        .uninstall_game("owner", "devilutionx")
        .expect("missing game uninstall is accepted");

    let after = database.load_state().expect("final state loads");
    assert_eq!(after, before);
}

#[test]
fn completing_a_download_marks_its_library_entry_installed() {
    let database = Database::open_memory().expect("database opens");
    database
        .queue_install("owner", "devilutionx")
        .expect("install queues");

    database
        .set_download_state("download-owner-devilutionx", "complete", Some(100))
        .expect("download completes");

    let state = database.load_state().expect("state loads");
    let download = state
        .downloads
        .iter()
        .find(|download| download.id == "download-owner-devilutionx")
        .expect("download remains visible");
    assert_eq!(download.state, "complete");
    assert_eq!(download.progress, 100);

    let library_entry = state.libraries["owner"]
        .iter()
        .find(|entry| entry.game_id == "devilutionx")
        .expect("library entry remains visible");
    assert_eq!(library_entry.install_state, "downloaded");
}

#[test]
fn setting_state_for_an_unknown_download_is_a_no_op() {
    let database = Database::open_memory().expect("database opens");
    let before = database.load_state().expect("initial state loads");

    database
        .set_download_state("missing-download", "complete", Some(100))
        .expect("unknown download is accepted");

    let after = database.load_state().expect("final state loads");
    assert_eq!(after, before);
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
fn new_database_seeds_tracked_projects_and_the_example_watch() {
    let database = Database::open_memory().expect("database opens");
    let state = database.load_state().expect("state loads");

    // The bundled catalog carries the full tracker seed, not a curated subset.
    assert!(state.tracked_projects.len() > 100);

    let recomp = state
        .tracked_projects
        .iter()
        .find(|project| project.id == "zelda64-recompiled")
        .expect("recomp record exists");
    assert_eq!(recomp.game_id, Some("zelda64recompiled".to_string()));
    assert_eq!(recomp.project_type, "static-recompilation");
    assert_eq!(recomp.game_short_title, "Majora's Mask");
    assert!(recomp.target_platforms.contains(&"Linux".to_string()));

    let dusklight = state
        .tracked_projects
        .iter()
        .find(|project| project.id == "dusklight")
        .expect("dusklight record exists");
    assert_eq!(dusklight.game_short_title, "Twilight Princess");

    let decomp = state
        .tracked_projects
        .iter()
        .find(|project| project.id == "zeldaret-mm")
        .expect("decomp record exists");
    assert_eq!(decomp.game_key, recomp.game_key);
    assert_eq!(decomp.game_id, None);

    assert_eq!(
        state.watchlists["owner"],
        vec!["the-legend-of-zelda-majoras-mask".to_string()]
    );
    assert!(state.watchlists["guest"].is_empty());
}

#[test]
fn toggle_watch_adds_and_removes_for_one_profile_and_ignores_untracked_games() {
    let database = Database::open_memory().expect("database opens");

    database
        .toggle_watch("owner", "star-fox-64")
        .expect("watch toggles on");
    let state = database.load_state().expect("state loads");
    assert!(state.watchlists["owner"].contains(&"star-fox-64".to_string()));
    assert!(!state.watchlists["guest"].contains(&"star-fox-64".to_string()));

    database
        .toggle_watch("owner", "star-fox-64")
        .expect("watch toggles off");
    let state = database.load_state().expect("state loads");
    assert!(!state.watchlists["owner"].contains(&"star-fox-64".to_string()));

    database
        .toggle_watch("owner", "not-a-tracked-game")
        .expect("untracked toggle is a no-op");
    let state = database.load_state().expect("state loads");
    assert!(!state.watchlists["owner"].contains(&"not-a-tracked-game".to_string()));
}

#[test]
fn wishlisted_version_update_creates_one_release_notice_and_repeat_creates_none() {
    let database = Database::open_memory().expect("database opens");
    let update = version_update(
        "zelda64-recompiled",
        "release-notice-test-1",
        Some("https://example.com/releases/release-notice-test-1"),
    );

    database
        .apply_tracking_updates(&[update.clone()], "2026-08-15T10:00:00Z")
        .expect("new version applies");
    database
        .apply_tracking_updates(&[update], "2026-08-15T11:00:00Z")
        .expect("repeated version applies");

    let state = database.load_state().expect("state loads");
    assert_eq!(state.release_notices.len(), 1);
    let notice = &state.release_notices[0];
    assert_eq!(notice.id, "notice-zelda64-recompiled-release-notice-test-1");
    assert_eq!(notice.game_key, "the-legend-of-zelda-majoras-mask");
    assert_eq!(notice.game_short_title, "Majora's Mask");
    assert_eq!(notice.version, "release-notice-test-1");
    assert_eq!(
        notice.url.as_deref(),
        Some("https://example.com/releases/release-notice-test-1")
    );
    assert_eq!(notice.noticed_at, "2026-08-15T10:00:00Z");

    let serialized = serde_json::to_value(notice).expect("notice serializes");
    assert_eq!(serialized["gameKey"], "the-legend-of-zelda-majoras-mask");
    assert_eq!(serialized["gameShortTitle"], "Majora's Mask");
    assert_eq!(serialized["noticedAt"], "2026-08-15T10:00:00Z");
}

#[test]
fn non_wishlisted_version_update_creates_no_release_notice() {
    let database = Database::open_memory().expect("database opens");

    database
        .apply_tracking_updates(
            &[version_update(
                "star-fox-64-recomp",
                "release-notice-test-1",
                None,
            )],
            "2026-08-15T10:00:00Z",
        )
        .expect("new version applies");

    let state = database.load_state().expect("state loads");
    assert!(state.release_notices.is_empty());
}

#[test]
fn dismiss_notice_removes_it_from_loaded_state() {
    let database = Database::open_memory().expect("database opens");
    let notice_id = "notice-zelda64-recompiled-release-notice-test-1";
    database
        .apply_tracking_updates(
            &[version_update(
                "zelda64-recompiled",
                "release-notice-test-1",
                None,
            )],
            "2026-08-15T10:00:00Z",
        )
        .expect("new version applies");

    database
        .dismiss_notice(notice_id)
        .expect("notice dismisses");

    let state = database.load_state().expect("state loads");
    assert!(state.release_notices.is_empty());
}

#[test]
fn release_notices_load_newest_first_and_keep_only_twenty() {
    let database = Database::open_memory().expect("database opens");

    for index in 0..21 {
        database
            .apply_tracking_updates(
                &[version_update(
                    "zelda64-recompiled",
                    &format!("release-notice-test-{index:02}"),
                    None,
                )],
                &format!("2026-08-15T10:{index:02}:00Z"),
            )
            .expect("new version applies");
    }

    let state = database.load_state().expect("state loads");
    assert_eq!(state.release_notices.len(), 20);
    assert_eq!(state.release_notices[0].version, "release-notice-test-20");
    assert_eq!(state.release_notices[19].version, "release-notice-test-01");
    assert!(
        state
            .release_notices
            .iter()
            .all(|notice| notice.version != "release-notice-test-00")
    );
}

#[test]
fn apply_tracking_updates_merges_new_evidence_and_preserves_the_rest() {
    use classicomp_lib::database::{DownloadAsset, TrackedProjectUpdate, TrackedRelease};

    let database = Database::open_memory().expect("database opens");
    let state = database.load_state().expect("state loads");
    assert_eq!(state.tracking_last_scan_at, None);

    let backfilled_cover = "https://example.com/dusklight-cover.jpg";
    database
        .apply_tracking_updates(
            &[TrackedProjectUpdate {
                id: "dusklight".to_string(),
                latest_version: None,
                last_activity_at: None,
                development_state: None,
                download_url: None,
                description: None,
                cover_url: Some(backfilled_cover.to_string()),
                cover_aspect: Some(1.5),
                cover_checked: true,
                topics: None,
                screenshots: None,
                recent_releases: None,
                download_assets: None,
                checked_at: None,
            }],
            "2026-08-14T11:00:00Z",
        )
        .expect("cover backfill applies");

    database
        .apply_tracking_updates(
            &[
                TrackedProjectUpdate {
                    id: "zelda64-recompiled".to_string(),
                    latest_version: Some("1.3.0".to_string()),
                    last_activity_at: Some("2026-08-14T00:00:00Z".to_string()),
                    development_state: None,
                    download_url: Some(
                        "https://github.com/Zelda64Recomp/Zelda64Recomp/releases/tag/1.3.0"
                            .to_string(),
                    ),
                    description: Some("Freshly pulled project description.".to_string()),
                    cover_url: Some("https://example.com/recomp-cover.jpg".to_string()),
                    cover_aspect: Some(1.5),
                    cover_checked: true,
                    topics: Some(vec!["recompilation".to_string(), "n64".to_string()]),
                    screenshots: Some(vec!["https://example.com/recomp.png".to_string()]),
                    recent_releases: Some(vec![TrackedRelease {
                        version: "1.3.0".to_string(),
                        url: "https://example.com/releases/1.3.0".to_string(),
                        published_at: Some("2026-08-14T00:00:00Z".to_string()),
                    }]),
                    download_assets: Some(vec![DownloadAsset {
                        name: "classicomp-linux.tar.gz".to_string(),
                        url: "https://example.com/downloads/classicomp-linux.tar.gz".to_string(),
                        size_bytes: Some(42_000_000),
                    }]),
                    checked_at: Some("2026-08-14T12:00:00Z".to_string()),
                },
                TrackedProjectUpdate {
                    id: "dusklight".to_string(),
                    latest_version: None,
                    last_activity_at: None,
                    development_state: None,
                    download_url: None,
                    description: None,
                    cover_url: None,
                    cover_aspect: None,
                    cover_checked: false,
                    topics: None,
                    screenshots: None,
                    recent_releases: None,
                    download_assets: None,
                    checked_at: Some("2026-08-14T12:00:00Z".to_string()),
                },
                TrackedProjectUpdate {
                    id: "not-a-project".to_string(),
                    latest_version: Some("9.9".to_string()),
                    last_activity_at: None,
                    development_state: None,
                    download_url: None,
                    description: None,
                    cover_url: None,
                    cover_aspect: None,
                    cover_checked: false,
                    topics: None,
                    screenshots: None,
                    recent_releases: None,
                    download_assets: None,
                    checked_at: None,
                },
            ],
            "2026-08-14T12:00:00Z",
        )
        .expect("updates apply");

    let state = database.load_state().expect("state loads");
    assert_eq!(
        state.tracking_last_scan_at,
        Some("2026-08-14T12:00:00Z".to_string())
    );

    let recomp = state
        .tracked_projects
        .iter()
        .find(|project| project.id == "zelda64-recompiled")
        .expect("recomp record exists");
    assert_eq!(recomp.latest_version, Some("1.3.0".to_string()));
    assert_eq!(
        recomp.last_activity_at,
        Some("2026-08-14T00:00:00Z".to_string())
    );
    assert_eq!(recomp.development_state, "active");
    assert_eq!(
        recomp.description,
        Some("Freshly pulled project description.".to_string())
    );
    assert_eq!(
        recomp.cover_url,
        Some("https://example.com/recomp-cover.jpg".to_string())
    );
    assert_eq!(
        recomp.download_url,
        Some("https://github.com/Zelda64Recomp/Zelda64Recomp/releases/tag/1.3.0".to_string())
    );
    assert_eq!(
        recomp.last_checked_at,
        Some("2026-08-14T12:00:00Z".to_string())
    );
    assert_eq!(
        recomp.topics,
        vec!["recompilation".to_string(), "n64".to_string()]
    );
    assert_eq!(
        recomp.screenshots,
        vec!["https://example.com/recomp.png".to_string()]
    );
    assert_eq!(
        recomp.recent_releases,
        vec![TrackedRelease {
            version: "1.3.0".to_string(),
            url: "https://example.com/releases/1.3.0".to_string(),
            published_at: Some("2026-08-14T00:00:00Z".to_string()),
        }]
    );
    assert_eq!(
        recomp.download_assets,
        vec![DownloadAsset {
            name: "classicomp-linux.tar.gz".to_string(),
            url: "https://example.com/downloads/classicomp-linux.tar.gz".to_string(),
            size_bytes: Some(42_000_000),
        }]
    );

    let dusklight = state
        .tracked_projects
        .iter()
        .find(|project| project.id == "dusklight")
        .expect("dusklight record exists");
    assert_eq!(dusklight.latest_version, Some("v1.4.1".to_string()));
    assert_eq!(
        dusklight.last_activity_at,
        Some("2026-08-08T02:43:04Z".to_string())
    );
    assert_eq!(
        dusklight.download_url,
        Some("https://github.com/TwilitRealm/dusklight/releases/tag/v1.4.1".to_string())
    );
    assert_eq!(
        dusklight.last_checked_at,
        Some("2026-08-14T12:00:00Z".to_string())
    );
    assert_eq!(dusklight.cover_url.as_deref(), Some(backfilled_cover));

    assert!(
        !state
            .tracked_projects
            .iter()
            .any(|project| project.id == "not-a-project")
    );

    database
        .apply_tracking_updates(
            &[TrackedProjectUpdate {
                id: "zelda64-recompiled".to_string(),
                latest_version: None,
                last_activity_at: None,
                development_state: None,
                download_url: None,
                description: None,
                cover_url: None,
                cover_aspect: None,
                cover_checked: false,
                topics: None,
                screenshots: None,
                recent_releases: None,
                download_assets: None,
                checked_at: None,
            }],
            "2026-08-14T12:00:00Z",
        )
        .expect("empty evidence preserves stored values");

    let state = database.load_state().expect("state loads");
    let recomp = state
        .tracked_projects
        .iter()
        .find(|project| project.id == "zelda64-recompiled")
        .expect("recomp record exists");
    assert_eq!(
        recomp.description,
        Some("Freshly pulled project description.".to_string())
    );
    assert_eq!(
        recomp.topics,
        vec!["recompilation".to_string(), "n64".to_string()]
    );
    assert_eq!(
        recomp.recent_releases,
        vec![TrackedRelease {
            version: "1.3.0".to_string(),
            url: "https://example.com/releases/1.3.0".to_string(),
            published_at: Some("2026-08-14T00:00:00Z".to_string()),
        }]
    );
    assert_eq!(
        recomp.download_assets,
        vec![DownloadAsset {
            name: "classicomp-linux.tar.gz".to_string(),
            url: "https://example.com/downloads/classicomp-linux.tar.gz".to_string(),
            size_bytes: Some(42_000_000),
        }]
    );
}

#[test]
fn add_tracked_projects_adds_new_records_and_ignores_existing_ids() {
    use classicomp_lib::database::{TrackedProject, TrackedRelease};

    let database = Database::open_memory().expect("database opens");
    let existing = database
        .load_state()
        .expect("state loads")
        .tracked_projects
        .into_iter()
        .find(|project| project.id == "zelda64-recompiled")
        .expect("existing project exists");
    let new_project = TrackedProject {
        id: "test-recomp".to_string(),
        game_key: "test-game".to_string(),
        game_title: "Test Game".to_string(),
        game_short_title: "Test".to_string(),
        game_id: None,
        description: Some("A test-tracked recompilation.".to_string()),
        cover_url: Some("https://example.com/cover.png".to_string()),
        cover_aspect: Some(1.5),
        screenshots: vec!["https://example.com/screenshot.png".to_string()],
        topics: vec!["recompilation".to_string()],
        recent_releases: vec![TrackedRelease {
            version: "0.1.0".to_string(),
            url: "https://example.com/releases/0.1.0".to_string(),
            published_at: None,
        }],
        download_assets: vec![classicomp_lib::database::DownloadAsset {
            name: "test-recomp-linux.tar.gz".to_string(),
            url: "https://example.com/downloads/test-recomp-linux.tar.gz".to_string(),
            size_bytes: None,
        }],
        project_name: "Test Recomp".to_string(),
        project_type: "static-recompilation".to_string(),
        development_state: "active".to_string(),
        stability: "experimental".to_string(),
        completion_percent: Some(25),
        completion_label: "Early".to_string(),
        original_release_year: 1998,
        original_platforms: vec!["Nintendo 64".to_string()],
        target_platforms: vec!["Linux".to_string()],
        latest_version: Some("0.1.0".to_string()),
        last_activity_at: Some("2026-08-14T00:00:00Z".to_string()),
        last_checked_at: Some("2026-08-14T12:00:00Z".to_string()),
        download_url: Some("https://example.com/download".to_string()),
        repository_url: "https://example.com/repository".to_string(),
    };
    let colliding_project = TrackedProject {
        id: existing.id.clone(),
        project_name: "Replacement that must be ignored".to_string(),
        ..new_project.clone()
    };

    database
        .add_tracked_projects(&[new_project.clone(), colliding_project])
        .expect("projects are added");

    let state = database.load_state().expect("state loads");
    let added = state
        .tracked_projects
        .iter()
        .find(|project| project.id == new_project.id)
        .expect("new project is visible");
    assert_eq!(added, &new_project);
    let unchanged = state
        .tracked_projects
        .iter()
        .find(|project| project.id == existing.id)
        .expect("existing project remains visible");
    assert_eq!(unchanged, &existing);
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
