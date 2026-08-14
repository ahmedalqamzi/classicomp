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
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LibraryEntry {
    pub game_id: String,
    pub install_state: String,
    pub install_path: Option<String>,
    pub play_minutes: i64,
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
pub struct AppState {
    pub active_profile_id: String,
    pub selected_game_id: String,
    pub route: String,
    pub profiles: Vec<Profile>,
    pub games: Vec<Game>,
    pub libraries: HashMap<String, Vec<LibraryEntry>>,
    pub downloads: Vec<Download>,
    pub save_snapshots: Vec<SaveSnapshot>,
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
        Ok(database)
    }

    pub fn open_memory() -> Result<Self> {
        let database = Self {
            connection: Connection::open_in_memory()?,
        };
        database.migrate()?;
        database.seed_if_empty()?;
        Ok(database)
    }

    pub fn load_state(&self) -> Result<AppState> {
        let active_profile_id = self
            .setting("active_profile_id")?
            .unwrap_or_else(|| "owner".to_string());
        let selected_game_id = self
            .setting("selected_game_id")?
            .unwrap_or_else(|| "openrct2".to_string());
        let route = self
            .setting("route")?
            .unwrap_or_else(|| "library".to_string());
        let cloud_provider = self.setting("cloud_provider")?;

        let profiles = self.profiles()?;
        let games = self.games()?;
        let libraries = self.libraries()?;
        let downloads = self.downloads(&active_profile_id)?;
        let save_snapshots = self.save_snapshots(&active_profile_id)?;

        Ok(AppState {
            active_profile_id,
            selected_game_id,
            route,
            profiles,
            games,
            libraries,
            downloads,
            save_snapshots,
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
        self.upsert_setting("route", Some("downloads"))?;
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
            ",
        )?;
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

        for profile_id in ["owner", "guest"] {
            for game in seed_games() {
                self.connection.execute(
                    "insert into user_library
                     (profile_id, game_id, install_state, install_path, play_minutes)
                     values (?1, ?2, 'available', null, 0)",
                    params![profile_id, game.id],
                )?;
            }
        }

        self.upsert_setting("active_profile_id", Some("owner"))?;
        self.upsert_setting("selected_game_id", Some("openrct2"))?;
        self.upsert_setting("route", Some("library"))?;
        self.upsert_setting("cloud_provider", None)?;
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
        Ok(statement
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
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?)
    }

    fn libraries(&self) -> Result<HashMap<String, Vec<LibraryEntry>>> {
        let mut statement = self.connection.prepare(
            "select profile_id, game_id, install_state, install_path, play_minutes
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
            title: "OpenRCT2".into(),
            short_title: "RCT".into(),
            summary: "Open-source reimplementation of RollerCoaster Tycoon 2".into(),
            description: "A modern engine for RollerCoaster Tycoon 2 with cross-platform support, expanded limits, and active upstream releases.".into(),
            artwork_url: "https://openrct2.io/uploads/images/background.jpg".into(),
            icon_url: "https://openrct2.io/favicon/apple-touch-icon.png".into(),
            runtime: "Native Linux".into(),
            version: "0.5.4".into(),
            executable_path: None,
            upstream_url: "https://openrct2.io".into(),
            accent: "#648f46".into(),
        },
        Game {
            id: "devilutionx".into(),
            title: "DevilutionX".into(),
            short_title: "DX".into(),
            summary: "Modern source port of Diablo and Hellfire".into(),
            description: "A maintained engine reconstruction focused on accurate gameplay, modern systems, and portable builds.".into(),
            artwork_url: "https://opengraph.githubassets.com/classicomp/diasurgical/devilutionX".into(),
            icon_url: "https://avatars.githubusercontent.com/u/25145906?s=128&v=4".into(),
            runtime: "Native Linux".into(),
            version: "1.5.4".into(),
            executable_path: None,
            upstream_url: "https://github.com/diasurgical/devilutionX".into(),
            accent: "#9b433b".into(),
        },
        Game {
            id: "openmw".into(),
            title: "OpenMW".into(),
            short_title: "MW".into(),
            summary: "Open-source engine for Morrowind".into(),
            description: "A clean-room engine implementation with a native Linux runtime, modern tooling, and strong mod support.".into(),
            artwork_url: "https://opengraph.githubassets.com/classicomp/OpenMW/openmw".into(),
            icon_url: "https://avatars.githubusercontent.com/u/340424?s=128&v=4".into(),
            runtime: "Native Linux".into(),
            version: "0.49.0".into(),
            executable_path: None,
            upstream_url: "https://openmw.org".into(),
            accent: "#8a6b3f".into(),
        },
        Game {
            id: "openttd".into(),
            title: "OpenTTD".into(),
            short_title: "TTD".into(),
            summary: "Transport simulation engine reimplementation".into(),
            description: "A long-running open-source transport simulation with native Linux releases and multiplayer support.".into(),
            artwork_url: "https://opengraph.githubassets.com/classicomp/OpenTTD/OpenTTD".into(),
            icon_url: "https://avatars.githubusercontent.com/u/113826?s=128&v=4".into(),
            runtime: "Native Linux".into(),
            version: "15.1".into(),
            executable_path: None,
            upstream_url: "https://www.openttd.org".into(),
            accent: "#4c7693".into(),
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
        },
        Game {
            id: "soh".into(),
            title: "Ship of Harkinian".into(),
            short_title: "SOH".into(),
            summary: "PC port of the Ocarina of Time engine".into(),
            description: "A community-built native port with modern rendering, input, accessibility, and quality-of-life options.".into(),
            artwork_url: "https://opengraph.githubassets.com/classicomp/HarbourMasters/Shipwright".into(),
            icon_url: "https://avatars.githubusercontent.com/u/88675208?s=128&v=4".into(),
            runtime: "Native Linux".into(),
            version: "MacReady Golf".into(),
            executable_path: None,
            upstream_url: "https://www.shipofharkinian.com".into(),
            accent: "#6a7750".into(),
        },
        Game {
            id: "zelda64recompiled".into(),
            title: "Zelda 64: Recompiled".into(),
            short_title: "Z64".into(),
            summary: "Static recompilation of Majora's Mask".into(),
            description: "A native recompilation project with modern rendering, ultrawide support, and high frame-rate presentation.".into(),
            artwork_url: "https://opengraph.githubassets.com/classicomp/Zelda64Recomp/Zelda64Recomp".into(),
            icon_url: "https://avatars.githubusercontent.com/u/169643224?s=128&v=4".into(),
            runtime: "Native Linux".into(),
            version: "1.2.2".into(),
            executable_path: None,
            upstream_url: "https://github.com/Zelda64Recomp/Zelda64Recomp".into(),
            accent: "#765a88".into(),
        },
    ]
}
