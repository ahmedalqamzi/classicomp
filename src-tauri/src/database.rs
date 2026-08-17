use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum DatabaseError {
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
}

pub type Result<T> = std::result::Result<T, DatabaseError>;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: String,
    pub display_name: String,
    pub avatar_initials: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Game {
    pub id: String,
    pub title: String,
    pub short_title: String,
    pub summary: String,
    pub description: String,
    pub artwork_url: String,
    pub icon_url: String,
    pub runtime: String,
    pub version: String,
    pub executable_path: Option<String>,
    pub upstream_url: String,
    pub accent: String,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LibraryEntry {
    pub game_id: String,
    pub install_state: String,
    pub install_path: Option<String>,
    pub play_minutes: i64,
    /// The player's own copy of the original game. Recompilations ship no game
    /// content, so this is what gates Play: `None` means setup is outstanding.
    pub rom_path: Option<String>,
    /// The release artifact as downloaded, still in the downloads folder.
    /// Installing consumes it and produces `install_path`.
    pub downloaded_file: Option<String>,
    /// The project version this install came from. Comparing it against the
    /// scanned latest version is how an available update is detected.
    pub installed_version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Download {
    pub id: String,
    pub profile_id: String,
    pub game_id: String,
    pub state: String,
    pub progress: i64,
    pub bytes_per_second: i64,
    pub eta_seconds: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SaveSnapshot {
    pub id: String,
    pub profile_id: String,
    pub game_id: String,
    pub device_name: String,
    pub created_at: String,
    pub state: String,
    pub local_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Mod {
    pub id: String,
    pub game_id: String,
    pub name: String,
    pub summary: String,
    pub version: String,
    pub author: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TrackedRelease {
    pub version: String,
    pub url: String,
    pub published_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DownloadAsset {
    pub name: String,
    pub url: String,
    pub size_bytes: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TrackedProject {
    pub id: String,
    pub game_key: String,
    pub game_title: String,
    pub game_short_title: String,
    pub game_id: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub cover_url: Option<String>,
    #[serde(default)]
    pub cover_aspect: Option<f64>,
    #[serde(default)]
    pub screenshots: Vec<String>,
    #[serde(default)]
    pub topics: Vec<String>,
    #[serde(default)]
    pub recent_releases: Vec<TrackedRelease>,
    #[serde(default)]
    pub download_assets: Vec<DownloadAsset>,
    pub project_name: String,
    pub project_type: String,
    pub development_state: String,
    pub stability: String,
    pub completion_percent: Option<i64>,
    pub completion_label: String,
    pub original_release_year: i64,
    pub original_platforms: Vec<String>,
    pub target_platforms: Vec<String>,
    pub latest_version: Option<String>,
    pub last_activity_at: Option<String>,
    pub last_checked_at: Option<String>,
    pub download_url: Option<String>,
    pub repository_url: String,
}

// One refresh result for a tracked project; None fields mean the source
// offered no new evidence and the stored value must be preserved, except
// for the cover pair when cover_checked explicitly replaces or clears it.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TrackedProjectUpdate {
    pub id: String,
    pub latest_version: Option<String>,
    pub last_activity_at: Option<String>,
    pub development_state: Option<String>,
    pub download_url: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub cover_url: Option<String>,
    #[serde(default)]
    pub cover_aspect: Option<f64>,
    #[serde(default)]
    pub cover_checked: bool,
    #[serde(default)]
    pub topics: Option<Vec<String>>,
    #[serde(default)]
    pub screenshots: Option<Vec<String>>,
    #[serde(default)]
    pub recent_releases: Option<Vec<TrackedRelease>>,
    #[serde(default)]
    pub download_assets: Option<Vec<DownloadAsset>>,
    pub checked_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseNotice {
    pub id: String,
    pub game_key: String,
    pub game_short_title: String,
    pub version: String,
    pub url: Option<String>,
    pub noticed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AppState {
    pub active_profile_id: Option<String>,
    pub selected_game_id: String,
    pub route: String,
    pub profiles: Vec<Profile>,
    pub games: Vec<Game>,
    pub libraries: HashMap<String, Vec<LibraryEntry>>,
    pub mods: HashMap<String, Vec<Mod>>,
    pub downloads: Vec<Download>,
    pub save_snapshots: Vec<SaveSnapshot>,
    pub tracked_projects: Vec<TrackedProject>,
    pub watchlists: HashMap<String, Vec<String>>,
    pub release_notices: Vec<ReleaseNotice>,
    pub tracking_last_scan_at: Option<String>,
    pub cloud_provider: Option<String>,
}

pub struct Database {
    connection: Connection,
}

impl Database {
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        let database = Self {
            connection: Connection::open(path)?,
        };
        database.migrate()?;
        database.seed_if_empty()?;
        database.fill_reference_tables_if_empty()?;
        Ok(database)
    }

    pub fn open_memory() -> Result<Self> {
        let database = Self {
            connection: Connection::open_in_memory()?,
        };
        database.migrate()?;
        database.seed_if_empty()?;
        database.fill_reference_tables_if_empty()?;
        Ok(database)
    }

    pub fn load_state(&self) -> Result<AppState> {
        let active_profile_id = self.setting("active_profile_id")?;
        let selected_game_id = self
            .setting("selected_game_id")?
            .unwrap_or_else(|| "openrct2".to_string());
        // The store is the app's main page; unknown or legacy routes land there.
        let route = match self.setting("route")?.as_deref() {
            Some("library") => "library".to_string(),
            Some("mods") => "mods".to_string(),
            _ => "store".to_string(),
        };
        let cloud_provider = self.setting("cloud_provider")?;

        let profiles = self.profiles()?;
        let games = self.games()?;
        let libraries = self.libraries()?;
        let mods = self.mods()?;
        let downloads = match &active_profile_id {
            Some(profile_id) => self.downloads(profile_id)?,
            None => Vec::new(),
        };
        let save_snapshots = match &active_profile_id {
            Some(profile_id) => self.save_snapshots(profile_id)?,
            None => Vec::new(),
        };
        let tracked_projects = self.tracked_projects()?;
        let watchlists = self.watchlists()?;
        let release_notices = self.release_notices()?;
        let tracking_last_scan_at = self.setting("tracking_last_scan_at")?;

        Ok(AppState {
            active_profile_id,
            selected_game_id,
            route,
            profiles,
            games,
            libraries,
            mods,
            downloads,
            save_snapshots,
            tracked_projects,
            watchlists,
            release_notices,
            tracking_last_scan_at,
            cloud_provider,
        })
    }

    pub fn set_active_profile(&self, profile_id: &str) -> Result<()> {
        let selected_game_id: Option<String> = self
            .connection
            .query_row(
                "select game_id from user_library where profile_id = ?1 order by rowid limit 1",
                [profile_id],
                |row| row.get(0),
            )
            .optional()?;
        self.upsert_setting("active_profile_id", Some(profile_id))?;
        if let Some(game_id) = selected_game_id {
            self.upsert_setting("selected_game_id", Some(&game_id))?;
        }
        Ok(())
    }

    pub fn sign_out(&self) -> Result<()> {
        self.upsert_setting("active_profile_id", None)
    }

    pub fn toggle_mod(&self, profile_id: &str, mod_id: &str) -> Result<()> {
        self.connection.execute(
            "insert into profile_mods (profile_id, mod_id, enabled) values (?1, ?2, 1)
             on conflict(profile_id, mod_id) do update set enabled = 1 - enabled",
            params![profile_id, mod_id],
        )?;
        Ok(())
    }

    pub fn toggle_watch(&self, profile_id: &str, game_key: &str) -> Result<()> {
        let tracked: i64 = self.connection.query_row(
            "select count(*) from tracked_projects where game_key = ?1",
            [game_key],
            |row| row.get(0),
        )?;
        if tracked == 0 {
            return Ok(());
        }

        let removed = self.connection.execute(
            "delete from profile_watchlist where profile_id = ?1 and game_key = ?2",
            params![profile_id, game_key],
        )?;
        if removed == 0 {
            self.connection.execute(
                "insert into profile_watchlist (profile_id, game_key) values (?1, ?2)",
                params![profile_id, game_key],
            )?;
        }
        Ok(())
    }

    pub fn apply_tracking_updates(
        &self,
        updates: &[TrackedProjectUpdate],
        scanned_at: &str,
    ) -> Result<()> {
        for update in updates {
            if let Some(latest_version) = &update.latest_version {
                let notice_id = format!("notice-{}-{latest_version}", update.id);
                self.connection.execute(
                    "insert or ignore into release_notices
                     (id, game_key, game_short_title, version, url, noticed_at)
                     select ?2, project.game_key,
                            coalesce(project.game_short_title, project.game_title),
                            ?3, coalesce(?4, project.download_url), ?5
                     from tracked_projects project
                     join app_settings active_profile
                       on active_profile.key = 'active_profile_id'
                      and active_profile.value is not null
                     join profile_watchlist watched
                       on watched.profile_id = active_profile.value
                      and watched.game_key = project.game_key
                     where project.id = ?1
                       and (project.latest_version is null or project.latest_version <> ?3)",
                    params![
                        update.id,
                        notice_id,
                        latest_version,
                        update.download_url,
                        scanned_at
                    ],
                )?;
            }

            let topics = update
                .topics
                .as_ref()
                .map(|values| serde_json::to_string(values).unwrap_or_default());
            let screenshots = update
                .screenshots
                .as_ref()
                .map(|values| serde_json::to_string(values).unwrap_or_default());
            let recent_releases = update
                .recent_releases
                .as_ref()
                .map(|values| serde_json::to_string(values).unwrap_or_default());
            let download_assets = update
                .download_assets
                .as_ref()
                .map(|values| serde_json::to_string(values).unwrap_or_default());
            self.connection.execute(
                "update tracked_projects set
                   latest_version = coalesce(?2, latest_version),
                   last_activity_at = coalesce(?3, last_activity_at),
                   development_state = coalesce(?4, development_state),
                   download_url = coalesce(?5, download_url),
                   description = coalesce(?6, description),
                   cover_url = case when ?8 then ?7 else cover_url end,
                   cover_aspect = case when ?8 then ?9 else cover_aspect end,
                   topics = coalesce(?10, topics),
                   screenshots = coalesce(?11, screenshots),
                   recent_releases = coalesce(?12, recent_releases),
                   download_assets = coalesce(?13, download_assets),
                   last_checked_at = coalesce(?14, last_checked_at)
                 where id = ?1",
                params![
                    update.id,
                    update.latest_version,
                    update.last_activity_at,
                    update.development_state,
                    update.download_url,
                    update.description,
                    update.cover_url,
                    update.cover_checked,
                    update.cover_aspect,
                    topics,
                    screenshots,
                    recent_releases,
                    download_assets,
                    update.checked_at
                ],
            )?;
        }

        self.connection.execute(
            "delete from release_notices
             where id not in (
               select id from release_notices
               order by noticed_at desc, rowid asc
               limit 20
             )",
            [],
        )?;
        self.upsert_setting("tracking_last_scan_at", Some(scanned_at))
    }

    pub fn dismiss_notice(&self, notice_id: &str) -> Result<()> {
        self.connection
            .execute("delete from release_notices where id = ?1", [notice_id])?;
        Ok(())
    }

    pub fn add_tracked_projects(&self, projects: &[TrackedProject]) -> Result<()> {
        for project in projects {
            self.insert_tracked_project(project)?;
        }
        Ok(())
    }

    fn insert_tracked_project(&self, project: &TrackedProject) -> Result<()> {
        self.connection.execute(
            "insert or ignore into tracked_projects
             (id, game_key, game_title, game_short_title, game_id, description,
              cover_url, cover_aspect, screenshots, topics, recent_releases, download_assets,
              project_name, project_type, development_state, stability,
              completion_percent, completion_label, original_release_year,
              original_platforms, target_platforms, latest_version,
              last_activity_at, last_checked_at, download_url, repository_url)
             values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12,
                     ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23,
                     ?24, ?25, ?26)",
            params![
                project.id,
                project.game_key,
                project.game_title,
                project.game_short_title,
                project.game_id,
                project.description,
                project.cover_url,
                project.cover_aspect,
                serde_json::to_string(&project.screenshots).unwrap_or_default(),
                serde_json::to_string(&project.topics).unwrap_or_default(),
                serde_json::to_string(&project.recent_releases).unwrap_or_default(),
                serde_json::to_string(&project.download_assets).unwrap_or_default(),
                project.project_name,
                project.project_type,
                project.development_state,
                project.stability,
                project.completion_percent,
                project.completion_label,
                project.original_release_year,
                serde_json::to_string(&project.original_platforms).unwrap_or_default(),
                serde_json::to_string(&project.target_platforms).unwrap_or_default(),
                project.latest_version,
                project.last_activity_at,
                project.last_checked_at,
                project.download_url,
                project.repository_url
            ],
        )?;
        Ok(())
    }

    /// Most of the catalogue is discovered by scanning and has no seeded game
    /// record, so downloading one has to create the library row's game too —
    /// otherwise the entry exists with nothing to render. Insert-only: a
    /// seeded game's curated identity must not be overwritten by a derived one.
    pub fn ensure_game(&self, game: &Game) -> Result<()> {
        self.connection.execute(
            "insert or ignore into games
             (id, title, short_title, summary, description, artwork_url, icon_url,
              runtime, version, executable_path, upstream_url, accent)
             values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                game.id,
                game.title,
                game.short_title,
                game.summary,
                game.description,
                game.artwork_url,
                game.icon_url,
                game.runtime,
                game.version,
                game.executable_path,
                game.upstream_url,
                game.accent,
            ],
        )?;
        Ok(())
    }

    /// Creates the derived game record, when there is one, before queueing.
    pub fn queue_install_with_game(
        &self,
        profile_id: &str,
        game_id: &str,
        game: Option<&Game>,
    ) -> Result<()> {
        if let Some(game) = game {
            self.ensure_game(game)?;
        }
        self.queue_install(profile_id, game_id)
    }

    pub fn queue_install(&self, profile_id: &str, game_id: &str) -> Result<()> {
        self.connection.execute(
            "insert into user_library (profile_id, game_id, install_state, install_path, play_minutes)
             values (?1, ?2, 'queued', null, 0)
             on conflict(profile_id, game_id) do update set install_state = 'queued'",
            params![profile_id, game_id],
        )?;
        self.connection.execute(
            "insert or ignore into downloads
             (id, profile_id, game_id, state, progress, bytes_per_second, eta_seconds)
             values (?1, ?2, ?3, 'queued', 0, 0, null)",
            params![
                format!("download-{profile_id}-{game_id}"),
                profile_id,
                game_id
            ],
        )?;
        Ok(())
    }

    pub fn set_game_rom(
        &self,
        profile_id: &str,
        game_id: &str,
        rom_path: Option<&str>,
    ) -> Result<()> {
        self.connection.execute(
            "update user_library set rom_path = ?3 where profile_id = ?1 and game_id = ?2",
            params![profile_id, game_id, rom_path],
        )?;
        Ok(())
    }

    pub fn set_game_installed(
        &self,
        profile_id: &str,
        game_id: &str,
        launch_target: &str,
        installed_version: Option<&str>,
    ) -> Result<()> {
        self.connection.execute(
            "update user_library set install_state = 'installed', install_path = ?3,
                    installed_version = ?4
             where profile_id = ?1 and game_id = ?2",
            params![profile_id, game_id, launch_target, installed_version],
        )?;
        Ok(())
    }

    pub fn uninstall_game(&self, profile_id: &str, game_id: &str) -> Result<()> {
        self.connection.execute(
            "delete from user_library where profile_id = ?1 and game_id = ?2",
            params![profile_id, game_id],
        )?;
        self.connection.execute(
            "delete from downloads where profile_id = ?1 and game_id = ?2",
            params![profile_id, game_id],
        )?;
        Ok(())
    }

    pub fn set_download_state(
        &self,
        download_id: &str,
        state: &str,
        progress: Option<i64>,
    ) -> Result<()> {
        self.connection.execute(
            "update downloads
             set state = ?2, progress = coalesce(?3, progress)
             where id = ?1",
            params![download_id, state, progress],
        )?;
        if state == "complete" {
            self.connection.execute(
                "update user_library
                 set install_state = 'downloaded'
                 where (profile_id, game_id) = (
                   select profile_id, game_id from downloads where id = ?1
                 )",
                [download_id],
            )?;
        }
        Ok(())
    }

    fn migrate(&self) -> Result<()> {
        self.connection.execute_batch(
            "
            pragma foreign_keys = on;

            create table if not exists profiles (
              id text primary key,
              display_name text not null,
              avatar_initials text not null
            );

            create table if not exists games (
              id text primary key,
              title text not null,
              short_title text not null,
              summary text not null,
              description text not null,
              artwork_url text not null,
              icon_url text not null,
              runtime text not null,
              version text not null,
              executable_path text,
              upstream_url text not null,
              accent text not null
            );

            create table if not exists user_library (
              profile_id text not null references profiles(id) on delete cascade,
              game_id text not null references games(id) on delete cascade,
              install_state text not null,
              install_path text,
              play_minutes integer not null default 0,
              primary key (profile_id, game_id)
            );

            create table if not exists downloads (
              id text primary key,
              profile_id text not null references profiles(id) on delete cascade,
              game_id text not null references games(id) on delete cascade,
              state text not null,
              progress integer not null default 0,
              bytes_per_second integer not null default 0,
              eta_seconds integer
            );

            create table if not exists save_snapshots (
              id text primary key,
              profile_id text not null references profiles(id) on delete cascade,
              game_id text not null references games(id) on delete cascade,
              device_name text not null,
              created_at text not null,
              state text not null,
              local_path text not null
            );

            create table if not exists app_settings (
              key text primary key,
              value text
            );

            create table if not exists game_tags (
              game_id text not null references games(id) on delete cascade,
              tag text not null,
              primary key (game_id, tag)
            );

            create table if not exists mods (
              id text primary key,
              game_id text not null references games(id) on delete cascade,
              name text not null,
              summary text not null,
              version text not null,
              author text not null
            );

            create table if not exists profile_mods (
              profile_id text not null references profiles(id) on delete cascade,
              mod_id text not null references mods(id) on delete cascade,
              enabled integer not null default 0,
              primary key (profile_id, mod_id)
            );

            create table if not exists tracked_projects (
              id text primary key,
              game_key text not null,
              game_title text not null,
              game_short_title text,
              game_id text,
              description text,
              cover_url text,
              cover_aspect real,
              screenshots text,
              topics text,
              recent_releases text,
              download_assets text,
              project_name text not null,
              project_type text not null,
              development_state text not null,
              stability text not null,
              completion_percent integer,
              completion_label text not null,
              original_release_year integer not null,
              original_platforms text not null,
              target_platforms text not null,
              latest_version text,
              last_activity_at text,
              last_checked_at text,
              download_url text,
              repository_url text not null
            );

            create table if not exists profile_watchlist (
              profile_id text not null references profiles(id) on delete cascade,
              game_key text not null,
              primary key (profile_id, game_key)
            );

            create table if not exists release_notices (
              id text primary key,
              game_key text not null,
              game_short_title text not null,
              version text not null,
              url text,
              noticed_at text not null
            );
            ",
        )?;
        self.add_column_if_missing("user_library", "rom_path", "text")?;
        self.add_column_if_missing("user_library", "downloaded_file", "text")?;
        self.add_column_if_missing("user_library", "installed_version", "text")?;
        self.add_column_if_missing("tracked_projects", "last_checked_at", "text")?;
        self.add_column_if_missing("tracked_projects", "download_url", "text")?;
        self.add_column_if_missing("tracked_projects", "game_short_title", "text")?;
        self.add_column_if_missing("tracked_projects", "description", "text")?;
        self.add_column_if_missing("tracked_projects", "cover_url", "text")?;
        self.add_column_if_missing("tracked_projects", "cover_aspect", "real")?;
        self.add_column_if_missing("tracked_projects", "screenshots", "text")?;
        self.add_column_if_missing("tracked_projects", "topics", "text")?;
        self.add_column_if_missing("tracked_projects", "recent_releases", "text")?;
        self.add_column_if_missing("tracked_projects", "download_assets", "text")?;
        self.connection.execute(
            "update tracked_projects
             set cover_url = null, cover_aspect = null
             where cover_url is not null and (
               lower(cover_url) like '%screenshot%' or
               lower(cover_url) like '%logo%' or
               lower(cover_url) like '%icon%' or
               lower(cover_url) like '%menu%' or
               lower(cover_url) like '%gui%' or
               lower(cover_url) like '%wallpaper%' or
               lower(cover_url) like '%settings%' or
               lower(cover_url) like '%.svg%'
             )",
            [],
        )?;
        // Accounts hold only games downloaded from the store; 'available' rows
        // were auto-seeded by earlier versions and are no longer meaningful.
        self.connection.execute(
            "delete from user_library where install_state = 'available'",
            [],
        )?;
        Ok(())
    }

    fn add_column_if_missing(&self, table: &str, column: &str, kind: &str) -> Result<()> {
        let existing: i64 = self.connection.query_row(
            "select count(*) from pragma_table_info(?1) where name = ?2",
            params![table, column],
            |row| row.get(0),
        )?;
        if existing == 0 {
            self.connection.execute(
                &format!("alter table {table} add column {column} {kind}"),
                [],
            )?;
        }
        Ok(())
    }

    fn seed_if_empty(&self) -> Result<()> {
        let profile_count: i64 =
            self.connection
                .query_row("select count(*) from profiles", [], |row| row.get(0))?;
        if profile_count > 0 {
            return Ok(());
        }

        self.connection.execute(
            "insert into profiles (id, display_name, avatar_initials) values (?1, ?2, ?3)",
            params!["owner", "The Dictator", "TD"],
        )?;
        self.connection.execute(
            "insert into profiles (id, display_name, avatar_initials) values (?1, ?2, ?3)",
            params!["guest", "Guest", "GU"],
        )?;

        for game in seed_games() {
            self.connection.execute(
                "insert into games
                 (id, title, short_title, summary, description, artwork_url, icon_url, runtime, version, executable_path, upstream_url, accent)
                 values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                params![
                    game.id,
                    game.title,
                    game.short_title,
                    game.summary,
                    game.description,
                    game.artwork_url,
                    game.icon_url,
                    game.runtime,
                    game.version,
                    game.executable_path,
                    game.upstream_url,
                    game.accent
                ],
            )?;
        }

        self.upsert_setting("active_profile_id", Some("owner"))?;
        self.upsert_setting("selected_game_id", Some("openrct2"))?;
        self.upsert_setting("route", Some("store"))?;
        self.upsert_setting("cloud_provider", None)?;
        Ok(())
    }

    fn fill_reference_tables_if_empty(&self) -> Result<()> {
        let tag_count: i64 =
            self.connection
                .query_row("select count(*) from game_tags", [], |row| row.get(0))?;
        if tag_count == 0 {
            for game in seed_games() {
                for tag in &game.tags {
                    self.connection.execute(
                        "insert into game_tags (game_id, tag) values (?1, ?2)",
                        params![game.id, tag],
                    )?;
                }
            }
        }

        let mod_count: i64 = self
            .connection
            .query_row("select count(*) from mods", [], |row| row.get(0))?;
        if mod_count == 0 {
            for module in seed_mods() {
                self.connection.execute(
                    "insert into mods (id, game_id, name, summary, version, author)
                     values (?1, ?2, ?3, ?4, ?5, ?6)",
                    params![
                        module.id,
                        module.game_id,
                        module.name,
                        module.summary,
                        module.version,
                        module.author
                    ],
                )?;
            }
        }

        let profile_mod_count: i64 =
            self.connection
                .query_row("select count(*) from profile_mods", [], |row| row.get(0))?;
        if profile_mod_count == 0 {
            self.connection.execute(
                "insert into profile_mods (profile_id, mod_id, enabled)
                 values ('owner', 'mod-openmw-tamriel-rebuilt', 1)",
                [],
            )?;
        }

        let tracked_count: i64 =
            self.connection
                .query_row("select count(*) from tracked_projects", [], |row| {
                    row.get(0)
                })?;
        // Sync the bundled catalog on every open so new records appear in
        // existing databases; scan-updated fields on known records are kept.
        for project in bundled_catalog() {
            self.insert_tracked_project(&project)?;
            // Identity and curation fields belong to the bundled catalog, so
            // corrections in a new app version reach existing rows; scan-owned
            // fields (versions, activity, media, releases) keep stored values.
            self.connection.execute(
                "update tracked_projects set
                   game_key = ?2,
                   game_title = ?3,
                   game_short_title = ?4,
                   game_id = ?5,
                   project_name = ?6,
                   project_type = ?7,
                   original_release_year = ?8,
                   original_platforms = ?9,
                   repository_url = ?10
                 where id = ?1",
                params![
                    project.id,
                    project.game_key,
                    project.game_title,
                    project.game_short_title,
                    project.game_id,
                    project.project_name,
                    project.project_type,
                    project.original_release_year,
                    serde_json::to_string(&project.original_platforms).unwrap_or_default(),
                    project.repository_url
                ],
            )?;
            // Bundled descriptions backfill rows that no scan has described yet;
            // scan-pulled text (coalesce merge) always wins afterwards.
            self.connection.execute(
                "update tracked_projects set description = ?2
                 where id = ?1 and description is null",
                params![project.id, project.description],
            )?;
            self.connection.execute(
                "update tracked_projects set cover_url = ?2
                 where id = ?1 and cover_url is null",
                params![project.id, project.cover_url],
            )?;
            self.connection.execute(
                "update tracked_projects set cover_aspect = ?2
                 where id = ?1 and cover_aspect is null",
                params![project.id, project.cover_aspect],
            )?;
            self.connection.execute(
                "update tracked_projects set screenshots = ?2
                 where id = ?1 and screenshots is null",
                params![
                    project.id,
                    serde_json::to_string(&project.screenshots).unwrap_or_default()
                ],
            )?;
            self.connection.execute(
                "update tracked_projects set topics = ?2
                 where id = ?1 and topics is null",
                params![
                    project.id,
                    serde_json::to_string(&project.topics).unwrap_or_default()
                ],
            )?;
            self.connection.execute(
                "update tracked_projects set recent_releases = ?2
                 where id = ?1 and recent_releases is null",
                params![
                    project.id,
                    serde_json::to_string(&project.recent_releases).unwrap_or_default()
                ],
            )?;
            self.connection.execute(
                "update tracked_projects set download_assets = ?2
                 where id = ?1 and download_assets is null",
                params![
                    project.id,
                    serde_json::to_string(&project.download_assets).unwrap_or_default()
                ],
            )?;
        }
        if tracked_count == 0 {
            // Seed the example watch only alongside the first catalog fill, so
            // clearing the watchlist later does not resurrect it on restart.
            self.connection.execute(
                "insert or ignore into profile_watchlist (profile_id, game_key)
                 values ('owner', 'the-legend-of-zelda-majoras-mask')",
                [],
            )?;
        }

        Ok(())
    }

    fn setting(&self, key: &str) -> Result<Option<String>> {
        Ok(self
            .connection
            .query_row(
                "select value from app_settings where key = ?1",
                [key],
                |row| row.get(0),
            )
            .optional()?
            .flatten())
    }

    fn upsert_setting(&self, key: &str, value: Option<&str>) -> Result<()> {
        self.connection.execute(
            "insert into app_settings (key, value) values (?1, ?2)
             on conflict(key) do update set value = excluded.value",
            params![key, value],
        )?;
        Ok(())
    }

    fn profiles(&self) -> Result<Vec<Profile>> {
        let mut statement = self
            .connection
            .prepare("select id, display_name, avatar_initials from profiles order by rowid")?;
        Ok(statement
            .query_map([], |row| {
                Ok(Profile {
                    id: row.get(0)?,
                    display_name: row.get(1)?,
                    avatar_initials: row.get(2)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?)
    }

    fn games(&self) -> Result<Vec<Game>> {
        let mut statement = self.connection.prepare(
            "select id, title, short_title, summary, description, artwork_url, icon_url,
                    runtime, version, executable_path, upstream_url, accent
             from games order by rowid",
        )?;
        let mut games = statement
            .query_map([], |row| {
                Ok(Game {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    short_title: row.get(2)?,
                    summary: row.get(3)?,
                    description: row.get(4)?,
                    artwork_url: row.get(5)?,
                    icon_url: row.get(6)?,
                    runtime: row.get(7)?,
                    version: row.get(8)?,
                    executable_path: row.get(9)?,
                    upstream_url: row.get(10)?,
                    accent: row.get(11)?,
                    tags: Vec::new(),
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        for game in &mut games {
            game.tags = self.game_tags(&game.id)?;
        }
        Ok(games)
    }

    fn game_tags(&self, game_id: &str) -> Result<Vec<String>> {
        let mut statement = self
            .connection
            .prepare("select tag from game_tags where game_id = ?1 order by tag")?;
        let tags = statement.query_map([game_id], |row| row.get::<_, String>(0))?;
        Ok(tags.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    fn mods(&self) -> Result<HashMap<String, Vec<Mod>>> {
        let mut statement = self.connection.prepare(
            "select p.id, m.id, m.game_id, m.name, m.summary, m.version, m.author,
                    coalesce(pm.enabled, 0)
             from profiles p
             cross join mods m
             left join profile_mods pm on pm.profile_id = p.id and pm.mod_id = m.id
             order by p.rowid, m.rowid",
        )?;
        let rows = statement.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                Mod {
                    id: row.get(1)?,
                    game_id: row.get(2)?,
                    name: row.get(3)?,
                    summary: row.get(4)?,
                    version: row.get(5)?,
                    author: row.get(6)?,
                    enabled: row.get::<_, i64>(7)? != 0,
                },
            ))
        })?;

        let mut mods: HashMap<String, Vec<Mod>> = HashMap::new();
        for row in rows {
            let (profile_id, module) = row?;
            mods.entry(profile_id).or_default().push(module);
        }
        Ok(mods)
    }

    fn libraries(&self) -> Result<HashMap<String, Vec<LibraryEntry>>> {
        let mut statement = self.connection.prepare(
            "select profile_id, game_id, install_state, install_path, play_minutes, rom_path,
                    downloaded_file, installed_version
             from user_library order by profile_id, rowid",
        )?;
        let rows = statement.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                LibraryEntry {
                    game_id: row.get(1)?,
                    install_state: row.get(2)?,
                    install_path: row.get(3)?,
                    play_minutes: row.get(4)?,
                    rom_path: row.get(5)?,
                    downloaded_file: row.get(6)?,
                    installed_version: row.get(7)?,
                },
            ))
        })?;

        let mut libraries: HashMap<String, Vec<LibraryEntry>> = HashMap::new();
        for row in rows {
            let (profile_id, entry) = row?;
            libraries.entry(profile_id).or_default().push(entry);
        }
        Ok(libraries)
    }

    fn downloads(&self, profile_id: &str) -> Result<Vec<Download>> {
        let mut statement = self.connection.prepare(
            "select id, profile_id, game_id, state, progress, bytes_per_second, eta_seconds
             from downloads where profile_id = ?1 order by rowid",
        )?;
        Ok(statement
            .query_map([profile_id], |row| {
                Ok(Download {
                    id: row.get(0)?,
                    profile_id: row.get(1)?,
                    game_id: row.get(2)?,
                    state: row.get(3)?,
                    progress: row.get(4)?,
                    bytes_per_second: row.get(5)?,
                    eta_seconds: row.get(6)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?)
    }

    fn tracked_projects(&self) -> Result<Vec<TrackedProject>> {
        let mut statement = self.connection.prepare(
            "select id, game_key, game_title, coalesce(game_short_title, game_title),
                    game_id, description, cover_url, cover_aspect,
                    coalesce(screenshots, '[]'), coalesce(topics, '[]'),
                    coalesce(recent_releases, '[]'), coalesce(download_assets, '[]'),
                    project_name, project_type,
                    development_state, stability, completion_percent,
                    completion_label, original_release_year, original_platforms,
                    target_platforms, latest_version, last_activity_at,
                    last_checked_at, download_url, repository_url
             from tracked_projects order by game_title, project_name",
        )?;
        Ok(statement
            .query_map([], |row| {
                let screenshots: String = row.get(8)?;
                let topics: String = row.get(9)?;
                let recent_releases: String = row.get(10)?;
                let download_assets: String = row.get(11)?;
                let original_platforms: String = row.get(19)?;
                let target_platforms: String = row.get(20)?;
                Ok(TrackedProject {
                    id: row.get(0)?,
                    game_key: row.get(1)?,
                    game_title: row.get(2)?,
                    game_short_title: row.get(3)?,
                    game_id: row.get(4)?,
                    description: row.get(5)?,
                    cover_url: row.get(6)?,
                    cover_aspect: row.get(7)?,
                    screenshots: serde_json::from_str(&screenshots).unwrap_or_default(),
                    topics: serde_json::from_str(&topics).unwrap_or_default(),
                    recent_releases: serde_json::from_str(&recent_releases).unwrap_or_default(),
                    download_assets: serde_json::from_str(&download_assets).unwrap_or_default(),
                    project_name: row.get(12)?,
                    project_type: row.get(13)?,
                    development_state: row.get(14)?,
                    stability: row.get(15)?,
                    completion_percent: row.get(16)?,
                    completion_label: row.get(17)?,
                    original_release_year: row.get(18)?,
                    original_platforms: serde_json::from_str(&original_platforms)
                        .unwrap_or_default(),
                    target_platforms: serde_json::from_str(&target_platforms).unwrap_or_default(),
                    latest_version: row.get(21)?,
                    last_activity_at: row.get(22)?,
                    last_checked_at: row.get(23)?,
                    download_url: row.get(24)?,
                    repository_url: row.get(25)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?)
    }

    fn watchlists(&self) -> Result<HashMap<String, Vec<String>>> {
        let mut statement = self.connection.prepare(
            "select p.id, w.game_key
             from profiles p
             left join profile_watchlist w on w.profile_id = p.id
             order by p.rowid, w.rowid",
        )?;
        let rows = statement.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?))
        })?;

        let mut watchlists: HashMap<String, Vec<String>> = HashMap::new();
        for row in rows {
            let (profile_id, game_key) = row?;
            let entry = watchlists.entry(profile_id).or_default();
            if let Some(game_key) = game_key {
                entry.push(game_key);
            }
        }
        Ok(watchlists)
    }

    fn release_notices(&self) -> Result<Vec<ReleaseNotice>> {
        let mut statement = self.connection.prepare(
            "select id, game_key, game_short_title, version, url, noticed_at
             from release_notices
             order by noticed_at desc, rowid asc
             limit 20",
        )?;
        Ok(statement
            .query_map([], |row| {
                Ok(ReleaseNotice {
                    id: row.get(0)?,
                    game_key: row.get(1)?,
                    game_short_title: row.get(2)?,
                    version: row.get(3)?,
                    url: row.get(4)?,
                    noticed_at: row.get(5)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?)
    }

    fn save_snapshots(&self, profile_id: &str) -> Result<Vec<SaveSnapshot>> {
        let mut statement = self.connection.prepare(
            "select id, profile_id, game_id, device_name, created_at, state, local_path
             from save_snapshots where profile_id = ?1 order by created_at desc",
        )?;
        Ok(statement
            .query_map([profile_id], |row| {
                Ok(SaveSnapshot {
                    id: row.get(0)?,
                    profile_id: row.get(1)?,
                    game_id: row.get(2)?,
                    device_name: row.get(3)?,
                    created_at: row.get(4)?,
                    state: row.get(5)?,
                    local_path: row.get(6)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?)
    }
}

fn seed_games() -> Vec<Game> {
    vec![
        Game {
            id: "openrct2".into(),
            title: "RollerCoaster Tycoon 2".into(),
            short_title: "RCT2".into(),
            summary: "Played through OpenRCT2, the open-source reimplementation".into(),
            description: "A modern engine for RollerCoaster Tycoon 2 with cross-platform support, expanded limits, and active upstream releases.".into(),
            artwork_url: "https://openrct2.io/uploads/images/background.jpg".into(),
            icon_url: "https://openrct2.io/favicon/apple-touch-icon.png".into(),
            runtime: "Native Linux".into(),
            version: "0.5.4".into(),
            executable_path: None,
            upstream_url: "https://openrct2.io".into(),
            accent: "#648f46".into(),
            tags: vec!["Simulation".into(), "Strategy".into()],
        },
        Game {
            id: "devilutionx".into(),
            title: "Diablo".into(),
            short_title: "Diablo".into(),
            summary: "Played through DevilutionX, the modern Diablo and Hellfire port".into(),
            description: "A maintained engine reconstruction focused on accurate gameplay, modern systems, and portable builds.".into(),
            artwork_url: "https://opengraph.githubassets.com/classicomp/diasurgical/devilutionX".into(),
            icon_url: "https://avatars.githubusercontent.com/u/25145906?s=128&v=4".into(),
            runtime: "Native Linux".into(),
            version: "1.5.4".into(),
            executable_path: None,
            upstream_url: "https://github.com/diasurgical/devilutionX".into(),
            accent: "#9b433b".into(),
            tags: vec!["RPG".into(), "Action".into()],
        },
        Game {
            id: "openmw".into(),
            title: "Morrowind".into(),
            short_title: "Morrowind".into(),
            summary: "Played through OpenMW, the open-source Morrowind engine".into(),
            description: "A clean-room engine implementation with a native Linux runtime, modern tooling, and strong mod support.".into(),
            artwork_url: "https://opengraph.githubassets.com/classicomp/OpenMW/openmw".into(),
            icon_url: "https://avatars.githubusercontent.com/u/340424?s=128&v=4".into(),
            runtime: "Native Linux".into(),
            version: "0.49.0".into(),
            executable_path: None,
            upstream_url: "https://openmw.org".into(),
            accent: "#8a6b3f".into(),
            tags: vec!["RPG".into(), "Open World".into()],
        },
        Game {
            id: "openttd".into(),
            title: "Transport Tycoon Deluxe".into(),
            short_title: "TTD".into(),
            summary: "Played through OpenTTD, the transport simulation reimplementation".into(),
            description: "A long-running open-source transport simulation with native Linux releases and multiplayer support.".into(),
            artwork_url: "https://opengraph.githubassets.com/classicomp/OpenTTD/OpenTTD".into(),
            icon_url: "https://avatars.githubusercontent.com/u/113826?s=128&v=4".into(),
            runtime: "Native Linux".into(),
            version: "15.1".into(),
            executable_path: None,
            upstream_url: "https://www.openttd.org".into(),
            accent: "#4c7693".into(),
            tags: vec!["Simulation".into(), "Strategy".into()],
        },
        Game {
            id: "scummvm".into(),
            title: "ScummVM".into(),
            short_title: "SC".into(),
            summary: "Adventure game engine collection".into(),
            description: "A compatibility layer for many classic point-and-click adventure engines with broad platform support.".into(),
            artwork_url: "https://opengraph.githubassets.com/classicomp/scummvm/scummvm".into(),
            icon_url: "https://avatars.githubusercontent.com/u/3267546?s=128&v=4".into(),
            runtime: "Native Linux".into(),
            version: "2.9.1".into(),
            executable_path: None,
            upstream_url: "https://www.scummvm.org".into(),
            accent: "#5a7e9d".into(),
            tags: vec!["Adventure".into(), "Point & Click".into()],
        },
        Game {
            id: "soh".into(),
            title: "Ocarina of Time".into(),
            short_title: "OoT".into(),
            summary: "Played through Ship of Harkinian, the native PC port".into(),
            description: "A community-built native port with modern rendering, input, accessibility, and quality-of-life options.".into(),
            artwork_url: "https://opengraph.githubassets.com/classicomp/HarbourMasters/Shipwright".into(),
            icon_url: "https://avatars.githubusercontent.com/u/88675208?s=128&v=4".into(),
            runtime: "Native Linux".into(),
            version: "MacReady Golf".into(),
            executable_path: None,
            upstream_url: "https://www.shipofharkinian.com".into(),
            accent: "#6a7750".into(),
            tags: vec!["Adventure".into(), "Action".into()],
        },
        Game {
            id: "zelda64recompiled".into(),
            title: "Majora's Mask".into(),
            short_title: "MM".into(),
            summary: "Played through Zelda 64: Recompiled, the static recompilation".into(),
            description: "A native recompilation project with modern rendering, ultrawide support, and high frame-rate presentation.".into(),
            artwork_url: "https://opengraph.githubassets.com/classicomp/Zelda64Recomp/Zelda64Recomp".into(),
            icon_url: "https://avatars.githubusercontent.com/u/169643224?s=128&v=4".into(),
            runtime: "Native Linux".into(),
            version: "1.2.2".into(),
            executable_path: None,
            upstream_url: "https://github.com/Zelda64Recomp/Zelda64Recomp".into(),
            accent: "#765a88".into(),
            tags: vec!["Adventure".into(), "Action".into()],
        },
    ]
}

// The bundled catalog is generated from the Classic Game Ports tracker
// sources and shared with the frontend seed (src/data/tracked-projects.json).
fn bundled_catalog() -> Vec<TrackedProject> {
    serde_json::from_str(include_str!("../../src/data/tracked-projects.json"))
        .expect("bundled tracked-projects catalog parses")
}

fn seed_mods() -> Vec<Mod> {
    vec![
        Mod {
            id: "mod-openmw-tamriel-rebuilt".into(),
            game_id: "openmw".into(),
            name: "Tamriel Rebuilt".into(),
            summary: "Adds the Morrowind mainland with new regions and quests.".into(),
            version: "24.12".into(),
            author: "Tamriel Rebuilt Team".into(),
            enabled: false,
        },
        Mod {
            id: "mod-openmw-rebirth".into(),
            game_id: "openmw".into(),
            name: "Morrowind Rebirth".into(),
            summary: "Overhaul of landscapes, cities, and balance.".into(),
            version: "7.0".into(),
            author: "trancemaster_198".into(),
            enabled: false,
        },
        Mod {
            id: "mod-openrct2-openmusic".into(),
            game_id: "openrct2".into(),
            name: "OpenMusic".into(),
            summary: "Open-source ride and scenery music pack.".into(),
            version: "1.2".into(),
            author: "OpenRCT2 Community".into(),
            enabled: false,
        },
        Mod {
            id: "mod-openrct2-scenarios".into(),
            game_id: "openrct2".into(),
            name: "Classic Scenarios Pack".into(),
            summary: "Recreates the original RCT1 scenario lineup.".into(),
            version: "2025.1".into(),
            author: "OpenRCT2 Community".into(),
            enabled: false,
        },
        Mod {
            id: "mod-devilutionx-infernal".into(),
            game_id: "devilutionx".into(),
            name: "Infernal Difficulty".into(),
            summary: "Brutal difficulty rebalance for veteran players.".into(),
            version: "0.9".into(),
            author: "Community".into(),
            enabled: false,
        },
        Mod {
            id: "mod-soh-hd-textures".into(),
            game_id: "soh".into(),
            name: "HD Texture Pack".into(),
            summary: "High-resolution texture replacements.".into(),
            version: "3.1".into(),
            author: "Community".into(),
            enabled: false,
        },
    ]
}
