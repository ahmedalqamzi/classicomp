// scripts/generate-tracked-catalog.mjs
import { existsSync, readFileSync, writeFileSync } from "node:fs";

// ../../../recomp-tracker/server/catalog/indexed-decomp-sources.ts
var INDEX_URL = "https://github.com/CharlotteCross1998/awesome-game-decompilations";
function indexedSource(game) {
  const [
    id,
    gameTitle,
    projectName,
    originalReleaseYear,
    generation,
    originalPlatform,
    projectType,
    owner,
    repository
  ] = game;
  return {
    id,
    gameTitle,
    projectName,
    originalReleaseYear,
    generation,
    originalPlatforms: [originalPlatform],
    projectType,
    owner,
    repository,
    url: `https://github.com/${owner}/${repository}`,
    catalogUrl: INDEX_URL,
    seedConfidence: "medium"
  };
}
var INDEXED_DECOMP_SOURCES = [
  ["battle-city-decomp", "Battle City", "battlecity", 1985, "8-bit", "Nintendo Entertainment System", "decompilation", "vgrichina", "battlecity"],
  ["dr-mario-disassembly", "Dr. Mario", "Dr. Mario Disassembly", 1990, "8-bit", "Nintendo Entertainment System", "decompilation", "Nostaljipi", "dr-mario-disassembly"],
  ["pokegold-spaceworld", "Pok\xE9mon Gold Space World Demo", "pokegold-spaceworld", 1997, "8-bit", "Game Boy prototype", "matching-decompilation", "pret", "pokegold-spaceworld"],
  ["pokered", "Pok\xE9mon Red and Blue", "pokered", 1996, "8-bit", "Game Boy", "matching-decompilation", "pret", "pokered"],
  ["pokeyellow", "Pok\xE9mon Yellow", "pokeyellow", 1998, "8-bit", "Game Boy", "matching-decompilation", "pret", "pokeyellow"],
  ["pokecrystal", "Pok\xE9mon Crystal", "pokecrystal", 2e3, "8-bit", "Game Boy Color", "matching-decompilation", "pret", "pokecrystal"],
  ["pokegold", "Pok\xE9mon Gold and Silver", "pokegold", 1999, "8-bit", "Game Boy Color", "matching-decompilation", "pret", "pokegold"],
  ["pokepinball", "Pok\xE9mon Pinball", "pokepinball", 1999, "8-bit", "Game Boy Color", "matching-decompilation", "pret", "pokepinball"],
  ["pokemon-puzzle-league-decomp", "Pok\xE9mon Puzzle League", "puzzleleague64", 2e3, "64-bit", "Nintendo 64", "matching-decompilation", "angheloalf", "puzzleleague64"],
  ["poketcg", "Pok\xE9mon Trading Card Game", "poketcg", 1998, "8-bit", "Game Boy Color", "matching-decompilation", "pret", "poketcg"],
  ["poketcg2", "Pok\xE9mon Card GB2", "poketcg2", 2001, "8-bit", "Game Boy Color", "matching-decompilation", "pret", "poketcg2"],
  ["klonoa-eod-decomp", "Klonoa: Empire of Dreams", "kl-eod-decomp", 2001, "32-bit", "Game Boy Advance", "matching-decompilation", "Dream-Atelier", "kl-eod-decomp"],
  ["pokeemerald-jp", "Pok\xE9mon Emerald (Japanese)", "pokeemerald-jp", 2004, "32-bit", "Game Boy Advance", "matching-decompilation", "pret", "pokeemerald-jp"],
  ["pokefirered", "Pok\xE9mon FireRed and LeafGreen", "pokefirered", 2004, "32-bit", "Game Boy Advance", "matching-decompilation", "pret", "pokefirered"],
  ["pmd-red", "Pok\xE9mon Mystery Dungeon: Red Rescue Team", "pmd-red", 2005, "32-bit", "Game Boy Advance", "matching-decompilation", "pret", "pmd-red"],
  ["pokepinballrs", "Pok\xE9mon Pinball: Ruby & Sapphire", "pokepinballrs", 2003, "32-bit", "Game Boy Advance", "matching-decompilation", "pret", "pokepinballrs"],
  ["pokeruby", "Pok\xE9mon Ruby and Sapphire", "pokeruby", 2002, "32-bit", "Game Boy Advance", "matching-decompilation", "pret", "pokeruby"],
  ["minish-cap-decomp", "The Legend of Zelda: The Minish Cap", "zeldaret/tmc", 2004, "32-bit", "Game Boy Advance", "matching-decompilation", "zeldaret", "tmc"],
  ["animal-forest-decomp", "Animal Forest", "zeldaret/af", 2001, "64-bit", "Nintendo 64", "matching-decompilation", "zeldaret", "af"],
  ["body-harvest-decomp", "Body Harvest", "Body Harvest Decompilation", 1998, "64-bit", "Nintendo 64", "matching-decompilation", "jaytheham", "body-harvest-decompilation"],
  ["pokemon-snap-decomp", "Pok\xE9mon Snap", "pokemonsnap", 1999, "64-bit", "Nintendo 64", "matching-decompilation", "ethteck", "pokemonsnap"],
  ["pokemon-stadium-decomp", "Pok\xE9mon Stadium", "pokestadium", 1999, "64-bit", "Nintendo 64", "matching-decompilation", "pret", "pokestadium"],
  ["pokemon-stadium-2-decomp", "Pok\xE9mon Stadium 2", "pokestadiumgs", 2e3, "64-bit", "Nintendo 64", "matching-decompilation", "pret", "pokestadiumgs"],
  ["animal-crossing-decomp", "Animal Crossing", "ac-decomp", 2001, "Sixth", "Nintendo GameCube", "matching-decompilation", "acreteam", "ac-decomp"],
  ["animal-forest-e-plus-decomp", "Animal Forest e+", "afe-decomp", 2003, "Sixth", "Nintendo GameCube", "matching-decompilation", "acreteam", "afe-decomp"],
  ["pokemon-xd-decomp", "Pok\xE9mon XD: Gale of Darkness", "xd-decomp", 2005, "Sixth", "Nintendo GameCube", "matching-decompilation", "TeamOrre", "xd-decomp"],
  ["star-fox-adventures-decomp", "Star Fox Adventures", "SFA-Decomp", 2002, "Sixth", "Nintendo GameCube", "matching-decompilation", "zcanann", "SFA-Decomp"],
  ["sims-2-gamecube-decomp", "The Sims 2", "Sims2DECOMP", 2005, "Sixth", "Nintendo GameCube", "matching-decompilation", "natebag", "Sims2DECOMP"],
  ["twilight-princess-decomp", "The Legend of Zelda: Twilight Princess", "zeldaret/tp", 2006, "Sixth", "Nintendo GameCube", "matching-decompilation", "zeldaret", "tp"],
  ["wind-waker-decomp", "The Legend of Zelda: The Wind Waker", "zeldaret/tww", 2002, "Sixth", "Nintendo GameCube", "matching-decompilation", "zeldaret", "tww"],
  ["dragon-quest-ix-decomp", "Dragon Quest IX", "dqix-decomp", 2009, "Seventh", "Nintendo DS", "matching-decompilation", "DQIX", "dqix-decomp"],
  ["pokemon-black-decomp", "Pok\xE9mon Black", "pokeblack", 2010, "Seventh", "Nintendo DS", "matching-decompilation", "pokemodding", "pokeblack"],
  ["pokemon-diamond-decomp", "Pok\xE9mon Diamond", "pokediamond", 2006, "Seventh", "Nintendo DS", "matching-decompilation", "pret", "pokediamond"],
  ["pokemon-heartgold-decomp", "Pok\xE9mon HeartGold", "pokeheartgold", 2009, "Seventh", "Nintendo DS", "matching-decompilation", "pret", "pokeheartgold"],
  ["pokemon-platinum-decomp", "Pok\xE9mon Platinum", "pokeplatinum", 2008, "Seventh", "Nintendo DS", "matching-decompilation", "pret", "pokeplatinum"],
  ["pmd-sky-decomp", "Pok\xE9mon Mystery Dungeon: Explorers of Sky", "pmd-sky", 2009, "Seventh", "Nintendo DS", "matching-decompilation", "pret", "pmd-sky"],
  ["phantom-hourglass-decomp", "The Legend of Zelda: Phantom Hourglass", "zeldaret/ph", 2007, "Seventh", "Nintendo DS", "matching-decompilation", "zeldaret", "ph"],
  ["spirit-tracks-decomp", "The Legend of Zelda: Spirit Tracks", "Spirit Tracks Decompilation", 2009, "Seventh", "Nintendo DS", "matching-decompilation", "yanis002", "st"],
  ["pokemon-battle-revolution-decomp", "Pok\xE9mon Battle Revolution", "pbr-dtk", 2006, "Seventh", "Wii", "matching-decompilation", "bgsamm", "pbr-dtk"],
  ["pokemon-rumble-decomp", "Pok\xE9mon Rumble", "pokemon-rumble", 2009, "Seventh", "Wii", "matching-decompilation", "KooShnoo", "pokemon-rumble"],
  ["pokepark-wii-decomp", "Pok\xE9Park Wii: Pikachu's Adventure", "pokepark-wii-decomp", 2009, "Seventh", "Wii", "matching-decompilation", "sephdb", "pokepark-wii-decomp"],
  ["rock-band-3-wii-decomp", "Rock Band 3", "rb3 Wii Decomp", 2010, "Seventh", "Wii", "matching-decompilation", "DarkRTA", "rb3"],
  ["skyward-sword-decomp", "The Legend of Zelda: Skyward Sword", "zeldaret/ss", 2011, "Seventh", "Wii", "matching-decompilation", "zeldaret", "ss"],
  ["oot3d-decomp", "The Legend of Zelda: Ocarina of Time 3D", "zeldaret/oot3d", 2011, "Seventh", "Nintendo 3DS", "matching-decompilation", "zeldaret", "oot3d"],
  ["ace-combat-6-recomp", "Ace Combat 6: Fires of Liberation", "AC6 Recomp", 2007, "Seventh", "Xbox 360", "static-recompilation", "sal063", "AC6_recomp"],
  ["banjo-nuts-bolts-recomp", "Banjo-Kazooie: Nuts & Bolts", "reNut", 2008, "Seventh", "Xbox 360", "static-recompilation", "masterspike52", "reNut"],
  ["blue-dragon-recomp", "Blue Dragon", "re:Blue", 2006, "Seventh", "Xbox 360", "static-recompilation", "SolarCookies", "reblue"],
  ["crackdown-recomp", "Crackdown", "Crackdown Recomp", 2007, "Seventh", "Xbox 360", "static-recompilation", "SkiddyToast", "Crackdown"],
  ["crackdown-2-recomp", "Crackdown 2", "Crackdown2-Recomp", 2010, "Seventh", "Xbox 360", "static-recompilation", "matty45", "Crackdown2-Recomp"],
  ["dance-central-3-decomp", "Dance Central 3", "dc3-decomp", 2012, "Seventh", "Xbox 360", "decompilation", "rjkiv", "dc3-decomp"],
  ["dah-path-furon-recomp", "Destroy All Humans! Path of the Furon", "reDAHM", 2008, "Seventh", "Xbox 360", "static-recompilation", "masterspike52", "reDAHM"],
  ["guitar-hero-2-recomp", "Guitar Hero II", "re-gh2", 2006, "Sixth", "PlayStation 2", "static-recompilation", "YoshiCrystal9", "re-gh2"],
  ["halo-3-recomp", "Halo 3", "Halo 3 Delta Recomp", 2007, "Seventh", "Xbox 360", "static-recompilation", "twist84", "halo3_cache_release_recomp"],
  ["rock-band-3-x360-recomp", "Rock Band 3", "band3_recomp", 2010, "Seventh", "Xbox 360", "static-recompilation", "ihatecompvir", "band3_recomp"],
  ["sonic-06-demo-recomp", "Sonic the Hedgehog (2006) Demo", "re-Sonic06Demo", 2006, "Seventh", "Xbox 360", "static-recompilation", "PranchaD", "re-Sonic06Demo"],
  ["tdu-recomp", "Test Drive Unlimited", "TDURE", 2006, "Seventh", "Xbox 360", "static-recompilation", "testdriveupgrade", "TDURE"],
  ["viva-pinata-tip-recomp", "Viva Pi\xF1ata: Trouble in Paradise", "TiP-Recomp", 2008, "Seventh", "Xbox 360", "static-recompilation", "SolarCookies", "TiP-Recomp"]
].map(indexedSource);

// ../../../recomp-tracker/server/catalog/port-sources.ts
var QUIVER_CATALOG = "https://github.com/tgeorgiadis/quiver-community-app-catalog";
function catalogSource(source) {
  return { ...source, catalogUrl: QUIVER_CATALOG, seedConfidence: "medium" };
}
var PORT_SOURCES = [
  catalogSource({
    id: "banjo-recomp",
    gameTitle: "Banjo-Kazooie",
    projectName: "BanjoRecomp",
    originalReleaseYear: 1998,
    generation: "64-bit",
    originalPlatforms: ["Nintendo 64"],
    projectType: "static-recompilation",
    owner: "BanjoRecomp",
    repository: "BanjoRecomp",
    url: "https://github.com/BanjoRecomp/BanjoRecomp"
  }),
  catalogSource({
    id: "bomberman-64-recomp",
    gameTitle: "Bomberman 64",
    projectName: "BM64Recomp",
    originalReleaseYear: 1997,
    generation: "64-bit",
    originalPlatforms: ["Nintendo 64"],
    projectType: "static-recompilation",
    owner: "RevoSucks",
    repository: "BM64Recomp",
    url: "https://github.com/RevoSucks/BM64Recomp"
  }),
  catalogSource({
    id: "bomberman-hero-recomp",
    gameTitle: "Bomberman Hero",
    projectName: "BMHeroRecomp",
    originalReleaseYear: 1998,
    generation: "64-bit",
    originalPlatforms: ["Nintendo 64"],
    projectType: "static-recompilation",
    owner: "RevoSucks",
    repository: "BMHeroRecomp",
    url: "https://github.com/RevoSucks/BMHeroRecomp"
  }),
  catalogSource({
    id: "castlevania-lod-recomp",
    gameTitle: "Castlevania: Legacy of Darkness",
    projectName: "cvlod_recomp",
    originalReleaseYear: 1999,
    generation: "64-bit",
    originalPlatforms: ["Nintendo 64"],
    projectType: "static-recompilation",
    owner: "fliperama86",
    repository: "cvlod_recomp",
    url: "https://github.com/fliperama86/cvlod_recomp"
  }),
  catalogSource({
    id: "chameleon-twist-recomp",
    gameTitle: "Chameleon Twist",
    projectName: "ChameleonTwist1 JP Recomp",
    originalReleaseYear: 1997,
    generation: "64-bit",
    originalPlatforms: ["Nintendo 64"],
    projectType: "static-recompilation",
    owner: "Rainchus",
    repository: "ChameleonTwist1-JP-Recomp",
    url: "https://github.com/Rainchus/ChameleonTwist1-JP-Recomp"
  }),
  catalogSource({
    id: "dinosaur-planet-recomp",
    gameTitle: "Dinosaur Planet",
    projectName: "Dinosaur Planet Recompiled",
    originalReleaseYear: 2e3,
    generation: "64-bit",
    originalPlatforms: ["Nintendo 64 prototype"],
    projectType: "static-recompilation",
    owner: "DinosaurPlanetRecomp",
    repository: "dino-recomp",
    url: "https://github.com/DinosaurPlanetRecomp/dino-recomp"
  }),
  catalogSource({
    id: "dr-mario-64-recomp",
    gameTitle: "Dr. Mario 64",
    projectName: "Dr. Mario 64 Recomp Plus",
    originalReleaseYear: 2001,
    generation: "64-bit",
    originalPlatforms: ["Nintendo 64"],
    projectType: "static-recompilation",
    owner: "theboy181",
    repository: "drmario64_recomp_plus",
    url: "https://github.com/theboy181/drmario64_recomp_plus"
  }),
  catalogSource({
    id: "duke-zero-hour-recomp",
    gameTitle: "Duke Nukem: Zero Hour",
    projectName: "DNZHRecomp",
    originalReleaseYear: 1999,
    generation: "64-bit",
    originalPlatforms: ["Nintendo 64"],
    projectType: "static-recompilation",
    owner: "pkgforge-dev",
    repository: "DNZHRecomp-AppImage",
    url: "https://github.com/pkgforge-dev/DNZHRecomp-AppImage"
  }),
  catalogSource({
    id: "harvest-moon-64-recomp",
    gameTitle: "Harvest Moon 64",
    projectName: "Harvest Moon 64 Recomp",
    originalReleaseYear: 1999,
    generation: "64-bit",
    originalPlatforms: ["Nintendo 64"],
    projectType: "static-recompilation",
    owner: "HarvestMoon64Recomp",
    repository: "HarvestMoon64Recomp",
    url: "https://github.com/HarvestMoon64Recomp/HarvestMoon64Recomp"
  }),
  catalogSource({
    id: "mario-kart-64-recomp",
    gameTitle: "Mario Kart 64",
    projectName: "MarioKart64Recomp",
    originalReleaseYear: 1996,
    generation: "64-bit",
    originalPlatforms: ["Nintendo 64"],
    projectType: "static-recompilation",
    owner: "pkgforge-dev",
    repository: "MarioKart64Recomp-AppImage",
    url: "https://github.com/pkgforge-dev/MarioKart64Recomp-AppImage"
  }),
  catalogSource({
    id: "mario-kart-64-recomp-independent",
    gameTitle: "Mario Kart 64",
    projectName: "Mario Kart 64: Recompiled (independent)",
    originalReleaseYear: 1996,
    generation: "64-bit",
    originalPlatforms: ["Nintendo 64"],
    projectType: "static-recompilation",
    owner: "arefdsg",
    repository: "MK64Recomp",
    url: "https://github.com/arefdsg/MK64Recomp"
  }),
  catalogSource({
    id: "mega-man-64-recomp",
    gameTitle: "Mega Man 64",
    projectName: "Mega Man 64 Recompiled",
    originalReleaseYear: 2e3,
    generation: "64-bit",
    originalPlatforms: ["Nintendo 64"],
    projectType: "static-recompilation",
    owner: "MegaMan64Recomp",
    repository: "MegaMan64Recompiled",
    url: "https://github.com/MegaMan64Recomp/MegaMan64Recompiled"
  }),
  catalogSource({
    id: "goemon-64-recomp",
    gameTitle: "Mystical Ninja Starring Goemon",
    projectName: "Goemon64Recomp",
    originalReleaseYear: 1997,
    generation: "64-bit",
    originalPlatforms: ["Nintendo 64"],
    projectType: "static-recompilation",
    owner: "klorfmorf",
    repository: "Goemon64Recomp",
    url: "https://github.com/klorfmorf/Goemon64Recomp"
  }),
  catalogSource({
    id: "pokemon-stadium-recomp",
    gameTitle: "Pok\xE9mon Stadium",
    projectName: "PokemonStadiumRecomp",
    originalReleaseYear: 1999,
    generation: "64-bit",
    originalPlatforms: ["Nintendo 64"],
    projectType: "static-recompilation",
    owner: "mstan",
    repository: "PokemonStadiumRecomp",
    url: "https://github.com/mstan/PokemonStadiumRecomp"
  }),
  catalogSource({
    id: "quest-64-recomp",
    gameTitle: "Quest 64",
    projectName: "Quest64-Recomp",
    originalReleaseYear: 1998,
    generation: "64-bit",
    originalPlatforms: ["Nintendo 64"],
    projectType: "static-recompilation",
    owner: "Rainchus",
    repository: "Quest64-Recomp",
    url: "https://github.com/Rainchus/Quest64-Recomp"
  }),
  catalogSource({
    id: "snowboard-kids-2-recomp",
    gameTitle: "Snowboard Kids 2",
    projectName: "Snowboard Kids 2 Recomp",
    originalReleaseYear: 1999,
    generation: "64-bit",
    originalPlatforms: ["Nintendo 64"],
    projectType: "static-recompilation",
    owner: "cdlewis",
    repository: "snowboardkids2-recomp",
    url: "https://github.com/cdlewis/snowboardkids2-recomp"
  }),
  catalogSource({
    id: "sssv-recomp",
    gameTitle: "Space Station Silicon Valley",
    projectName: "SSSV Recomp",
    originalReleaseYear: 1998,
    generation: "64-bit",
    originalPlatforms: ["Nintendo 64"],
    projectType: "static-recompilation",
    owner: "Cellenseres",
    repository: "SSSV_Recomp",
    url: "https://github.com/Cellenseres/SSSV_Recomp"
  }),
  catalogSource({
    id: "star-fox-64-recomp",
    gameTitle: "Star Fox 64",
    projectName: "Starfox64Recomp",
    originalReleaseYear: 1997,
    generation: "64-bit",
    originalPlatforms: ["Nintendo 64"],
    projectType: "static-recompilation",
    owner: "pkgforge-dev",
    repository: "Starfox64Recomp-AppImage",
    url: "https://github.com/pkgforge-dev/Starfox64Recomp-AppImage"
  }),
  catalogSource({
    id: "lighthouse",
    gameTitle: "Banjo-Kazooie",
    projectName: "Lighthouse",
    originalReleaseYear: 1998,
    generation: "64-bit",
    originalPlatforms: ["Nintendo 64"],
    projectType: "source-port",
    owner: "HarbourMasters",
    repository: "Lighthouse",
    url: "https://github.com/HarbourMasters/Lighthouse"
  }),
  catalogSource({
    id: "two-ship-two-harkinian",
    gameTitle: "The Legend of Zelda: Majora's Mask",
    projectName: "2Ship2Harkinian",
    originalReleaseYear: 2e3,
    generation: "64-bit",
    originalPlatforms: ["Nintendo 64"],
    projectType: "source-port",
    owner: "HarbourMasters",
    repository: "2ship2harkinian",
    url: "https://github.com/HarbourMasters/2ship2harkinian"
  }),
  catalogSource({
    id: "spaghettikart",
    gameTitle: "Mario Kart 64",
    projectName: "SpaghettiKart",
    originalReleaseYear: 1996,
    generation: "64-bit",
    originalPlatforms: ["Nintendo 64"],
    projectType: "source-port",
    owner: "HarbourMasters",
    repository: "SpaghettiKart",
    url: "https://github.com/HarbourMasters/SpaghettiKart"
  }),
  catalogSource({
    id: "ghostship",
    gameTitle: "Super Mario 64",
    projectName: "Ghostship",
    originalReleaseYear: 1996,
    generation: "64-bit",
    originalPlatforms: ["Nintendo 64"],
    projectType: "source-port",
    owner: "HarbourMasters",
    repository: "Ghostship",
    url: "https://github.com/HarbourMasters/Ghostship"
  }),
  catalogSource({
    id: "perfect-dark-port",
    gameTitle: "Perfect Dark",
    projectName: "Perfect Dark PC Port",
    originalReleaseYear: 2e3,
    generation: "64-bit",
    originalPlatforms: ["Nintendo 64"],
    projectType: "source-port",
    owner: "fgsfdsfgs",
    repository: "perfect_dark",
    url: "https://github.com/fgsfdsfgs/perfect_dark"
  }),
  catalogSource({
    id: "sm64-coop-dx",
    gameTitle: "Super Mario 64",
    projectName: "sm64coopdx",
    originalReleaseYear: 1996,
    generation: "64-bit",
    originalPlatforms: ["Nintendo 64"],
    projectType: "source-port",
    owner: "coop-deluxe",
    repository: "sm64coopdx",
    url: "https://github.com/coop-deluxe/sm64coopdx"
  }),
  catalogSource({
    id: "battleship",
    gameTitle: "Super Smash Bros.",
    projectName: "BattleShip",
    originalReleaseYear: 1999,
    generation: "64-bit",
    originalPlatforms: ["Nintendo 64"],
    projectType: "source-port",
    owner: "JRickey",
    repository: "BattleShip",
    url: "https://github.com/JRickey/BattleShip"
  }),
  catalogSource({
    id: "golden-balloon",
    gameTitle: "Diddy Kong Racing",
    projectName: "Golden Balloon",
    originalReleaseYear: 1997,
    generation: "64-bit",
    originalPlatforms: ["Nintendo 64"],
    projectType: "source-port",
    owner: "akratch",
    repository: "goldenballoon",
    url: "https://github.com/akratch/goldenballoon"
  }),
  catalogSource({
    id: "smw-port",
    gameTitle: "Super Mario World",
    projectName: "smw",
    originalReleaseYear: 1990,
    generation: "16-bit",
    originalPlatforms: ["Super Nintendo"],
    projectType: "source-port",
    owner: "snesrev",
    repository: "smw",
    url: "https://github.com/snesrev/smw"
  }),
  catalogSource({
    id: "zelda3-port",
    gameTitle: "The Legend of Zelda: A Link to the Past",
    projectName: "Zelda 3",
    originalReleaseYear: 1991,
    generation: "16-bit",
    originalPlatforms: ["Super Nintendo"],
    projectType: "source-port",
    owner: "RadzPrower",
    repository: "Zelda-3-Launcher",
    url: "https://github.com/RadzPrower/Zelda-3-Launcher"
  }),
  catalogSource({
    id: "minish-cap-port",
    gameTitle: "The Legend of Zelda: The Minish Cap",
    projectName: "Minish Cap PC Port",
    originalReleaseYear: 2004,
    generation: "32-bit",
    originalPlatforms: ["Game Boy Advance"],
    projectType: "source-port",
    owner: "MatheoVignaud",
    repository: "tmc",
    url: "https://github.com/MatheoVignaud/tmc"
  }),
  catalogSource({
    id: "project-picori",
    gameTitle: "The Legend of Zelda: The Minish Cap",
    projectName: "Project Picori",
    originalReleaseYear: 2004,
    generation: "32-bit",
    originalPlatforms: ["Game Boy Advance"],
    projectType: "source-port",
    owner: "999sian",
    repository: "tmc",
    url: "https://github.com/999sian/tmc"
  }),
  catalogSource({
    id: "animal-crossing-pc-port",
    gameTitle: "Animal Crossing",
    projectName: "ACGC PC Port",
    originalReleaseYear: 2001,
    generation: "Sixth",
    originalPlatforms: ["Nintendo GameCube"],
    projectType: "source-port",
    owner: "flyngmt",
    repository: "ACGC-PC-Port",
    url: "https://github.com/flyngmt/ACGC-PC-Port"
  }),
  catalogSource({
    id: "dusklight",
    gameTitle: "The Legend of Zelda: Twilight Princess",
    projectName: "Dusklight",
    originalReleaseYear: 2006,
    generation: "Sixth",
    originalPlatforms: ["Nintendo GameCube", "Wii"],
    projectType: "source-port",
    owner: "TwilitRealm",
    repository: "dusklight",
    url: "https://github.com/TwilitRealm/dusklight"
  }),
  catalogSource({
    id: "redriver2",
    gameTitle: "Driver 2",
    projectName: "REDRIVER2",
    originalReleaseYear: 2e3,
    generation: "32-bit",
    originalPlatforms: ["PlayStation"],
    projectType: "source-port",
    owner: "OpenDriver2",
    repository: "REDRIVER2",
    url: "https://github.com/OpenDriver2/REDRIVER2"
  }),
  catalogSource({
    id: "ctr-native",
    gameTitle: "Crash Team Racing",
    projectName: "CTR Native",
    originalReleaseYear: 1999,
    generation: "32-bit",
    originalPlatforms: ["PlayStation"],
    projectType: "source-port",
    owner: "CTR-tools",
    repository: "ctr-native",
    url: "https://github.com/CTR-tools/ctr-native"
  }),
  catalogSource({
    id: "unleashed-recomp",
    gameTitle: "Sonic Unleashed",
    projectName: "Unleashed Recompiled",
    originalReleaseYear: 2008,
    generation: "Seventh",
    originalPlatforms: ["Xbox 360", "PlayStation 3"],
    projectType: "static-recompilation",
    owner: "hedge-dev",
    repository: "UnleashedRecomp",
    url: "https://github.com/hedge-dev/UnleashedRecomp"
  }),
  catalogSource({
    id: "skate-3-recomp",
    gameTitle: "Skate 3",
    projectName: "Skate 3 Recomp",
    originalReleaseYear: 2010,
    generation: "Seventh",
    originalPlatforms: ["Xbox 360", "PlayStation 3"],
    projectType: "static-recompilation",
    owner: "mchughalex",
    repository: "skate3recomp",
    url: "https://github.com/mchughalex/skate3recomp"
  }),
  catalogSource({
    id: "svr07-recomp",
    gameTitle: "WWE SmackDown vs. Raw 2007",
    projectName: "SVR07 Recomp",
    originalReleaseYear: 2006,
    generation: "Seventh",
    originalPlatforms: ["Xbox 360"],
    projectType: "static-recompilation",
    owner: "HollywoodAkeem",
    repository: "SVR07-Recomp",
    url: "https://github.com/HollywoodAkeem/SVR07-Recomp"
  }),
  catalogSource({
    id: "pokemon-gen1-recomp",
    gameTitle: "Pok\xE9mon Red, Blue, and Yellow",
    projectName: "Gen1RecompProject",
    originalReleaseYear: 1996,
    generation: "8-bit",
    originalPlatforms: ["Game Boy"],
    projectType: "static-recompilation",
    owner: "bryanthaboi",
    repository: "pokemon-gen1-recomp-project",
    url: "https://github.com/bryanthaboi/pokemon-gen1-recomp-project"
  }),
  catalogSource({
    id: "crash-bandicoot-recomp",
    gameTitle: "Crash Bandicoot",
    projectName: "Crash Bandicoot Recomp",
    originalReleaseYear: 1996,
    generation: "32-bit",
    originalPlatforms: ["PlayStation"],
    projectType: "static-recompilation",
    owner: "Matteo842",
    repository: "CrashBandicoot-Launcher",
    url: "https://github.com/Matteo842/CrashBandicoot-Launcher"
  }),
  catalogSource({
    id: "symphony-recomp",
    gameTitle: "Castlevania: Symphony of the Night",
    projectName: "Symphony Recomp",
    originalReleaseYear: 1997,
    generation: "32-bit",
    originalPlatforms: ["PlayStation"],
    projectType: "static-recompilation",
    owner: "BlackLabelHQ",
    repository: "SymphonyRecomp",
    url: "https://github.com/BlackLabelHQ/SymphonyRecomp"
  }),
  catalogSource({
    id: "syphon-filter-pc-port",
    gameTitle: "Syphon Filter",
    projectName: "Syphon Filter PC Port",
    originalReleaseYear: 1999,
    generation: "32-bit",
    originalPlatforms: ["PlayStation"],
    projectType: "static-recompilation",
    owner: "Madxbio97",
    repository: "SF-pc-port",
    url: "https://github.com/Madxbio97/SF-pc-port"
  })
];

// ../../../recomp-tracker/server/catalog/seed-sources.ts
var CORE_SOURCES = [
  {
    id: "zelda64-recompiled",
    gameTitle: "The Legend of Zelda: Majora's Mask",
    projectName: "Zelda 64: Recompiled",
    originalReleaseYear: 2e3,
    generation: "64-bit",
    originalPlatforms: ["Nintendo 64"],
    projectType: "static-recompilation",
    owner: "Zelda64Recomp",
    repository: "Zelda64Recomp",
    url: "https://github.com/Zelda64Recomp/Zelda64Recomp"
  },
  {
    id: "shipwright",
    gameTitle: "The Legend of Zelda: Ocarina of Time",
    projectName: "Ship of Harkinian",
    originalReleaseYear: 1998,
    generation: "64-bit",
    originalPlatforms: ["Nintendo 64"],
    projectType: "source-port",
    owner: "HarbourMasters",
    repository: "Shipwright",
    url: "https://github.com/HarbourMasters/Shipwright"
  },
  {
    id: "starship",
    gameTitle: "Star Fox 64",
    projectName: "Starship",
    originalReleaseYear: 1997,
    generation: "64-bit",
    originalPlatforms: ["Nintendo 64"],
    projectType: "source-port",
    owner: "HarbourMasters",
    repository: "Starship",
    url: "https://github.com/HarbourMasters/Starship"
  },
  {
    id: "sm64-decomp",
    gameTitle: "Super Mario 64",
    projectName: "sm64",
    originalReleaseYear: 1996,
    generation: "64-bit",
    originalPlatforms: ["Nintendo 64"],
    projectType: "matching-decompilation",
    owner: "n64decomp",
    repository: "sm64",
    url: "https://github.com/n64decomp/sm64"
  },
  {
    id: "perfect-dark-decomp",
    gameTitle: "Perfect Dark",
    projectName: "Perfect Dark Decompilation",
    originalReleaseYear: 2e3,
    generation: "64-bit",
    originalPlatforms: ["Nintendo 64"],
    projectType: "matching-decompilation",
    owner: "n64decomp",
    repository: "perfect_dark",
    url: "https://github.com/n64decomp/perfect_dark"
  },
  {
    id: "opengoal-jak-1",
    gameTitle: "Jak and Daxter: The Precursor Legacy",
    projectName: "OpenGOAL \u2014 Jak 1",
    originalReleaseYear: 2001,
    generation: "Sixth",
    originalPlatforms: ["PlayStation 2"],
    projectType: "hybrid",
    owner: "open-goal",
    repository: "jak-project",
    url: "https://github.com/open-goal/jak-project"
  },
  {
    id: "opengoal-jak-2",
    gameTitle: "Jak II",
    projectName: "OpenGOAL \u2014 Jak 2",
    originalReleaseYear: 2003,
    generation: "Sixth",
    originalPlatforms: ["PlayStation 2"],
    projectType: "hybrid",
    owner: "open-goal",
    repository: "jak-project",
    url: "https://github.com/open-goal/jak-project"
  },
  {
    id: "opengoal-jak-3",
    gameTitle: "Jak 3",
    projectName: "OpenGOAL \u2014 Jak 3",
    originalReleaseYear: 2004,
    generation: "Sixth",
    originalPlatforms: ["PlayStation 2"],
    projectType: "hybrid",
    owner: "open-goal",
    repository: "jak-project",
    url: "https://github.com/open-goal/jak-project"
  },
  {
    id: "pokeemerald",
    gameTitle: "Pok\xE9mon Emerald",
    projectName: "pokeemerald",
    originalReleaseYear: 2004,
    generation: "32-bit",
    originalPlatforms: ["Game Boy Advance"],
    projectType: "matching-decompilation",
    owner: "pret",
    repository: "pokeemerald",
    url: "https://github.com/pret/pokeemerald"
  },
  {
    id: "zeldaret-mm",
    gameTitle: "The Legend of Zelda: Majora's Mask",
    projectName: "zeldaret/mm",
    originalReleaseYear: 2e3,
    generation: "64-bit",
    originalPlatforms: ["Nintendo 64"],
    projectType: "matching-decompilation",
    owner: "zeldaret",
    repository: "mm",
    url: "https://github.com/zeldaret/mm"
  },
  {
    id: "zeldaret-oot",
    gameTitle: "The Legend of Zelda: Ocarina of Time",
    projectName: "zeldaret/oot",
    originalReleaseYear: 1998,
    generation: "64-bit",
    originalPlatforms: ["Nintendo 64"],
    projectType: "matching-decompilation",
    owner: "zeldaret",
    repository: "oot",
    url: "https://github.com/zeldaret/oot"
  },
  {
    id: "sotn-decomp",
    gameTitle: "Castlevania: Symphony of the Night",
    projectName: "sotn-decomp",
    originalReleaseYear: 1997,
    generation: "32-bit",
    originalPlatforms: ["PlayStation", "Sega Saturn"],
    projectType: "matching-decompilation",
    owner: "Xeeynamo",
    repository: "sotn-decomp",
    url: "https://github.com/Xeeynamo/sotn-decomp"
  },
  {
    id: "metroid-prime-decomp",
    gameTitle: "Metroid Prime",
    projectName: "PrimeDecomp",
    originalReleaseYear: 2002,
    generation: "Sixth",
    originalPlatforms: ["Nintendo GameCube"],
    projectType: "matching-decompilation",
    owner: "PrimeDecomp",
    repository: "prime",
    url: "https://github.com/PrimeDecomp/prime"
  },
  {
    id: "dr-mario-64-decomp",
    gameTitle: "Dr. Mario 64",
    projectName: "drmario64",
    originalReleaseYear: 2001,
    generation: "64-bit",
    originalPlatforms: ["Nintendo 64"],
    projectType: "matching-decompilation",
    owner: "AngheloAlf",
    repository: "drmario64",
    url: "https://github.com/AngheloAlf/drmario64"
  },
  {
    id: "tatsh-expert-xylophone",
    gameTitle: "REFLEC BEAT plus",
    projectName: "expert-xylophone",
    originalReleaseYear: 2011,
    generation: "Seventh",
    originalPlatforms: ["iOS"],
    projectType: "decompilation",
    owner: "Tatsh",
    repository: "expert-xylophone",
    url: "https://github.com/Tatsh/expert-xylophone",
    seedConfidence: "medium"
  },
  {
    id: "tatsh-expert-satphone",
    gameTitle: "jubeat plus",
    projectName: "expert-satphone",
    originalReleaseYear: 2010,
    generation: "Seventh",
    originalPlatforms: ["iOS"],
    projectType: "decompilation",
    owner: "Tatsh",
    repository: "expert-satphone",
    url: "https://github.com/Tatsh/expert-satphone",
    seedConfidence: "medium"
  },
  {
    id: "swiftshine-wlsi",
    gameTitle: "Wario Land: Shake It!",
    projectName: "wlsi",
    originalReleaseYear: 2008,
    generation: "Seventh",
    originalPlatforms: ["Wii"],
    projectType: "matching-decompilation",
    owner: "Swiftshine",
    repository: "wlsi",
    url: "https://github.com/Swiftshine/wlsi",
    seedConfidence: "medium"
  },
  {
    id: "yokimitsuro-khdays-port",
    gameTitle: "Kingdom Hearts 358/2 Days",
    projectName: "khdays-port",
    originalReleaseYear: 2009,
    generation: "Seventh",
    originalPlatforms: ["Nintendo DS"],
    projectType: "source-port",
    owner: "Yokimitsuro",
    repository: "khdays-port",
    url: "https://github.com/Yokimitsuro/khdays-port",
    seedConfidence: "medium"
  }
];
var KNOWN_SOURCES = [
  ...CORE_SOURCES,
  ...PORT_SOURCES,
  ...INDEXED_DECOMP_SOURCES
];

// ../../../recomp-tracker/server/catalog/seed-records.ts
var VERIFIED_AT = "2026-08-08T00:00:00.000Z";
var DETAILS = {
  "yokimitsuro-khdays-port": {
    developmentState: "active",
    completionLabel: "Front end running; gameplay not yet playable",
    stability: "experimental",
    stabilityReason: "The project documents a working native front end and asset pipeline, while gameplay remains its next milestone.",
    targetPlatforms: ["Windows", "Linux", "macOS"],
    features: [
      { key: "native-front-end", label: "Native boot flow, title screen, and menus", category: "platform" },
      { key: "native-asset-pipeline", label: "Native textures, models, animation, text, and audio", category: "graphics" },
      { key: "mod-overrides", label: "Drop-in asset and content overrides", category: "mods" }
    ],
    textureStatus: "supported",
    claim: "The official repository documents an experimental native PC runtime with a working front end, cross-platform builds, and texture/mod overrides."
  },
  dusklight: {
    developmentState: "active",
    completionLabel: "Released",
    stability: "stable",
    stabilityReason: "The project publishes installable releases and documents supported game versions and known fixes.",
    targetPlatforms: ["Windows", "Linux", "macOS", "Android", "iOS"],
    features: [
      { key: "native-port", label: "Native desktop and mobile port", category: "platform" },
      { key: "modern-renderers", label: "D3D12, Vulkan, and Metal renderers", category: "graphics" },
      { key: "touch-controls", label: "Mobile touch controls", category: "input" },
      { key: "enhancements", label: "Fixes, enhancements, and tools", category: "quality-of-life" }
    ],
    textureStatus: "supported",
    texturePacks: [
      {
        name: "Texture replacements",
        url: "https://github.com/TwilitRealm/dusklight/releases/tag/v1.4.1"
      }
    ],
    latestRelease: {
      version: "v1.4.1",
      url: "https://github.com/TwilitRealm/dusklight/releases/tag/v1.4.1",
      publishedAt: "2026-06-16T22:33:28Z"
    },
    lastActivityAt: "2026-08-08T02:43:04Z",
    claim: "Official reverse-engineered Twilight Princess reimplementation with releases, enhancements, mobile support, and texture replacements."
  },
  "zelda64-recompiled": {
    developmentState: "active",
    completionLabel: "Released; percentage not published",
    stability: "stable",
    stabilityReason: "The project publishes ready-to-run releases and documents known issues.",
    targetPlatforms: ["Windows", "Linux", "macOS", "Steam Deck"],
    features: [
      { key: "high-framerate", label: "High frame rate", category: "graphics" },
      { key: "widescreen", label: "Widescreen & ultrawide", category: "graphics" },
      { key: "mod-support", label: "Mod support", category: "mods" },
      { key: "gyro-aim", label: "Gyro aim", category: "input" }
    ],
    textureStatus: "supported",
    texturePacks: [
      {
        name: "RT64 texture packs",
        url: "https://github.com/Zelda64Recomp/Zelda64Recomp#mod-support"
      }
    ],
    claim: "Static recompilation with releases, enhancements, mod support, and texture-pack support."
  },
  shipwright: {
    developmentState: "active",
    completionLabel: "Released; percentage not published",
    stability: "stable",
    stabilityReason: "The project provides supported releases and a quick-start path.",
    targetPlatforms: ["Windows", "Linux", "macOS"],
    features: [
      { key: "native-port", label: "Native PC port", category: "platform" },
      { key: "release-builds", label: "Prebuilt releases", category: "platform" }
    ],
    claim: "Ocarina of Time source port with supported releases and setup documentation."
  },
  starship: {
    developmentState: "active",
    completionLabel: "Playable release; percentage not published",
    stability: "playable",
    stabilityReason: "Releases are available, while continuous builds are explicitly described as playtesting builds.",
    targetPlatforms: ["Windows", "Linux", "macOS", "Nintendo Switch"],
    features: [
      { key: "cross-platform", label: "Cross-platform releases", category: "platform" },
      { key: "custom-assets", label: "Custom asset support", category: "mods" }
    ],
    claim: "Star Fox 64 PC port with releases and custom-asset support."
  },
  "sm64-decomp": {
    developmentState: "maintenance",
    completionLabel: "Buildable decompilation; percentage not published",
    stability: "unknown",
    stabilityReason: "This is a source project rather than an end-user port.",
    claim: "Super Mario 64 decompilation that rebuilds supported ROM versions."
  },
  "perfect-dark-decomp": {
    developmentState: "completed",
    completionLabel: "Complete (project statement)",
    stability: "unknown",
    stabilityReason: "This is a complete matching source project rather than an end-user port.",
    claim: "The repository describes itself as a complete matching decompilation."
  },
  "opengoal-jak-1": {
    developmentState: "completed",
    completionLabel: "Complete (project statement)",
    stability: "stable",
    stabilityReason: "The project describes Jak 1 as polished and complete.",
    targetPlatforms: ["Windows", "Linux", "macOS via Rosetta"],
    features: [
      { key: "native-x64", label: "Native x86-64 port", category: "platform" },
      { key: "mod-support", label: "Modification support", category: "mods" }
    ],
    claim: "OpenGOAL describes Jak 1 as polished and complete."
  },
  "opengoal-jak-2": {
    developmentState: "active",
    completionLabel: "Beta; essentially complete for casual play",
    stability: "playable",
    stabilityReason: "The project describes Jak 2 as beta with remaining issues but essentially complete for casual users.",
    targetPlatforms: ["Windows", "Linux", "macOS via Rosetta"],
    features: [
      { key: "native-x64", label: "Native x86-64 port", category: "platform" },
      { key: "mod-support", label: "Modification support", category: "mods" }
    ],
    claim: "OpenGOAL describes Jak 2 as beta and essentially complete for casual users."
  },
  "opengoal-jak-3": {
    developmentState: "active",
    completionLabel: "In development; percentage not published",
    stability: "experimental",
    stabilityReason: "The project states that Jak 3 still has a good amount of work remaining.",
    targetPlatforms: ["Windows", "Linux", "macOS via Rosetta"],
    features: [{ key: "native-x64", label: "Native x86-64 target", category: "platform" }],
    claim: "OpenGOAL states that Jak 3 still has substantial work remaining."
  },
  pokeemerald: {
    developmentState: "active",
    completionLabel: "Buildable decompilation; percentage not published",
    stability: "unknown",
    stabilityReason: "This is a source project rather than an end-user port.",
    claim: "Pok\xE9mon Emerald decompilation that builds the documented ROM."
  },
  "zeldaret-mm": {
    developmentState: "active",
    completionLabel: "Work in progress; percentage not published",
    stability: "unknown",
    stabilityReason: "The repository explicitly says it is not a PC port.",
    claim: "Work-in-progress Majora's Mask matching decompilation."
  },
  "zeldaret-oot": {
    developmentState: "active",
    completionLabel: "Work in progress; percentage not published",
    stability: "unknown",
    stabilityReason: "The repository explicitly says it is not producing a PC port.",
    claim: "Work-in-progress Ocarina of Time matching decompilation."
  },
  "sotn-decomp": {
    developmentState: "active",
    completionLabel: "Work in progress; percentage not published",
    stability: "unknown",
    stabilityReason: "This is a multi-version source project rather than an end-user port.",
    claim: "Work-in-progress matching decompilation for PlayStation, PSP, and Saturn versions."
  },
  "metroid-prime-decomp": {
    developmentState: "active",
    completionLabel: "Work in progress; percentage not published",
    stability: "unknown",
    stabilityReason: "This is a matching source project rather than an end-user port.",
    claim: "Work-in-progress matching decompilation of Metroid Prime."
  },
  "dr-mario-64-decomp": {
    developmentState: "active",
    completionLabel: "In development; live graph available",
    stability: "unknown",
    stabilityReason: "This is a matching source project rather than an end-user port.",
    claim: "Matching Dr. Mario 64 decompilation with a linked progress graph."
  }
};
function fallbackDetails(source) {
  return {
    developmentState: "unknown",
    completionLabel: "Catalogued; verification queued",
    stability: "unknown",
    stabilityReason: "The project is indexed, but its playability has not yet been verified from first-party evidence.",
    claim: `Official repository for the catalogued ${source.gameTitle} project.`
  };
}
function slugify(value) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
function buildSeed(source) {
  const details = DETAILS[source.id] ?? fallbackDetails(source);
  const evidenceId = `${source.id}-repository`;
  const evidence = [
    {
      id: evidenceId,
      label: "Official project repository",
      url: source.url,
      claim: details.claim,
      checkedAt: VERIFIED_AT
    }
  ];
  if (source.catalogUrl) {
    evidence.push({
      id: `${source.id}-catalog`,
      label: "Community port catalog",
      url: source.catalogUrl,
      claim: `${source.projectName} is listed in a maintained community application catalog.`,
      checkedAt: VERIFIED_AT
    });
  }
  return {
    id: source.id,
    slug: `${slugify(source.gameTitle)}-${slugify(source.projectName)}`,
    gameTitle: source.gameTitle,
    projectName: source.projectName,
    originalReleaseYear: source.originalReleaseYear,
    generation: source.generation,
    originalPlatforms: source.originalPlatforms,
    targetPlatforms: details.targetPlatforms ?? [],
    projectType: source.projectType,
    developmentState: details.developmentState,
    completionPercent: null,
    completionLabel: details.completionLabel,
    completionEvidenceId: null,
    stability: details.stability,
    stabilityReason: details.stabilityReason,
    latestRelease: details.latestRelease ?? null,
    lastActivityAt: details.lastActivityAt ?? null,
    features: (details.features ?? []).map((feature) => ({ ...feature, evidenceId })),
    texturePacks: {
      status: details.textureStatus ?? "unknown",
      packs: (details.texturePacks ?? []).map((pack) => ({ ...pack, evidenceId }))
    },
    repository: {
      owner: source.owner,
      name: source.repository,
      url: source.url
    },
    evidence,
    dataConflicts: [],
    confidence: source.id === "dusklight" ? "high" : source.seedConfidence ?? "high",
    lastVerifiedAt: VERIFIED_AT,
    isStale: false,
    manualOverrides: []
  };
}
var SEED_RECORDS = KNOWN_SOURCES.map(buildSeed);

// scripts/generate-tracked-catalog.mjs
var OUT = new URL("../src/data/tracked-projects.json", import.meta.url).pathname;
var PULLED = new URL("./pulled-descriptions.json", import.meta.url).pathname;
var pulledDescriptions = existsSync(PULLED) ? JSON.parse(readFileSync(PULLED, "utf8")) : {};
var COVERS = new URL("./pulled-covers.json", import.meta.url).pathname;
var SCREENSHOTS = new URL("./pulled-screenshots.json", import.meta.url).pathname;
var AUDIT = new URL("./media-audit.json", import.meta.url).pathname;
var pulledCovers = existsSync(COVERS) ? JSON.parse(readFileSync(COVERS, "utf8")) : {};
var pulledScreenshots = existsSync(SCREENSHOTS) ? JSON.parse(readFileSync(SCREENSHOTS, "utf8")) : {};
var mediaAudit = existsSync(AUDIT) ? JSON.parse(readFileSync(AUDIT, "utf8")) : { covers: {}, screenshots: {} };
var GAMEPLAY = new URL("./pulled-gameplay.json", import.meta.url).pathname;
var pulledGameplay = existsSync(GAMEPLAY) ? JSON.parse(readFileSync(GAMEPLAY, "utf8")) : {};
var ASSETS = new URL("./pulled-assets.json", import.meta.url).pathname;
var pulledAssets = existsSync(ASSETS) ? JSON.parse(readFileSync(ASSETS, "utf8")) : {};
var RELEASES = new URL("./pulled-releases.json", import.meta.url).pathname;
var pulledReleases = existsSync(RELEASES) ? JSON.parse(readFileSync(RELEASES, "utf8")) : {};
function withPulledRelease(record) {
  const release = pulledReleases[record.id];
  if (!release || record.latestVersion !== null) return record;
  return {
    ...record,
    latestVersion: release.version,
    downloadUrl: record.downloadUrl ?? release.url,
    recentReleases: record.recentReleases.length > 0 ? record.recentReleases : [{ version: release.version, url: release.url, publishedAt: release.publishedAt ?? null }]
  };
}
function assetsFor(id) {
  const assets = pulledAssets[id];
  if (!Array.isArray(assets)) return [];
  return assets.filter((a) => a && typeof a.name === "string" && typeof a.url === "string").map((a) => ({
    name: a.name,
    url: a.url,
    sizeBytes: typeof a.sizeBytes === "number" ? a.sizeBytes : null
  })).slice(0, 12);
}
var COVER_JUNK = /\b(screenshots?|gameplay|logos?|icons?|menu|gui|wallpaper|settings?|svg)\b/;
var LANDSCAPE_BOX = /box|cover|packaging|capa|caratula|jaquette|kutu/;
var SHOT_JUNK = /\b(shields|badgen|badge|workflows|discord|svg|logos?|favicon|icons?|settings?|controller|config|menu|diagram|chart|install|build|objdiff|launcher|gyro|extract|propert\w*|banner|title|dolphin)\b|#gh-(light|dark)-mode/;
var normalizeMediaName = (url) => url.toLowerCase().replace(/[-_./?#%]+/g, " ");
function coverFor(key) {
  const cover = pulledCovers[key];
  if (typeof cover !== "string" || cover.length === 0) return { url: null, aspect: null };
  const name = normalizeMediaName(cover);
  if (COVER_JUNK.test(name)) return { url: null, aspect: null };
  const aspect = mediaAudit.covers?.[key]?.aspect ?? null;
  if (aspect === null) {
    return LANDSCAPE_BOX.test(name) ? { url: cover, aspect: null } : { url: null, aspect: null };
  }
  if (aspect <= 1.05 || LANDSCAPE_BOX.test(name)) return { url: cover, aspect };
  return { url: null, aspect: null };
}
function screenshotsFor(id, key) {
  const gameplay = Array.isArray(pulledGameplay[key]) ? pulledGameplay[key].filter((u) => typeof u === "string") : [];
  const shots = pulledScreenshots[id];
  const suspect = new Set(mediaAudit.screenshots?.[id]?.suspect ?? []);
  const readme = Array.isArray(shots) ? shots.filter(
    (u) => typeof u === "string" && !suspect.has(u) && !SHOT_JUNK.test(normalizeMediaName(u))
  ) : [];
  return [.../* @__PURE__ */ new Set([...gameplay, ...readme])].slice(0, 8);
}
function describeRecord(record) {
  const repoUrl = record.repository?.url ?? "";
  const pulled = pulledDescriptions[repoUrl];
  if (typeof pulled === "string" && pulled.trim().length > 0) return pulled.trim();
  return record.evidence?.[0]?.claim ?? null;
}
var GAME_LINKS = {
  shipwright: "soh",
  "zelda64-recompiled": "zelda64recompiled"
};
var SHORT_TITLE_OVERRIDES = {
  "Jak and Daxter: The Precursor Legacy": "Jak and Daxter",
  "Wario Land: Shake It!": "Wario Land",
  "Klonoa: Empire of Dreams": "Klonoa",
  "Classic adventure engines": "ScummVM",
  "Ace Combat 6: Fires of Liberation": "Ace Combat 6",
  "Duke Nukem: Zero Hour": "Duke Nukem: Zero Hour",
  "Pok\xE9mon Pinball: Ruby & Sapphire": "Pok\xE9mon Pinball: Ruby & Sapphire",
  "Pok\xE9mon XD: Gale of Darkness": "Pok\xE9mon XD",
  "Pok\xE9Park Wii: Pikachu's Adventure": "Pok\xE9Park Wii"
};
function shortTitle(title) {
  const override = SHORT_TITLE_OVERRIDES[title];
  if (override) return override;
  const colon = title.lastIndexOf(": ");
  if (colon === -1) return title;
  const tail = title.slice(colon + 2).trim();
  return tail.length >= 3 ? tail : title;
}
function gameKey(title) {
  return title.replace(/['’]/g, "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
function toTracked(record) {
  return {
    id: record.id,
    gameKey: gameKey(record.gameTitle),
    gameTitle: record.gameTitle,
    gameShortTitle: shortTitle(record.gameTitle),
    gameId: GAME_LINKS[record.id] ?? null,
    description: describeRecord(record),
    projectName: record.projectName,
    projectType: record.projectType,
    developmentState: record.developmentState,
    stability: record.stability,
    completionPercent: record.completionPercent,
    completionLabel: record.completionLabel,
    originalReleaseYear: record.originalReleaseYear,
    originalPlatforms: record.originalPlatforms,
    targetPlatforms: record.targetPlatforms,
    latestVersion: record.latestRelease?.version ?? null,
    lastActivityAt: record.lastActivityAt,
    lastCheckedAt: null,
    downloadUrl: record.latestRelease?.url ?? null,
    coverUrl: coverFor(gameKey(record.gameTitle)).url,
    coverAspect: coverFor(gameKey(record.gameTitle)).aspect,
    screenshots: screenshotsFor(record.id, gameKey(record.gameTitle)),
    topics: [],
    recentReleases: record.latestRelease ? [{
      version: record.latestRelease.version,
      url: record.latestRelease.url,
      publishedAt: record.latestRelease.publishedAt ?? null
    }] : [],
    downloadAssets: assetsFor(record.id),
    repositoryUrl: record.repository?.url ?? ""
  };
}
function pcPort(partial) {
  return {
    gameId: null,
    projectType: "source-port",
    developmentState: "active",
    stability: "stable",
    completionPercent: null,
    completionLabel: "Released",
    targetPlatforms: ["Windows", "Linux", "macOS"],
    lastActivityAt: null,
    lastCheckedAt: null,
    downloadUrl: null,
    topics: [],
    recentReleases: [],
    ...partial,
    downloadAssets: assetsFor(partial.id),
    coverUrl: coverFor(gameKey(partial.gameTitle)).url,
    coverAspect: coverFor(gameKey(partial.gameTitle)).aspect,
    screenshots: screenshotsFor(partial.id, gameKey(partial.gameTitle)),
    gameKey: gameKey(partial.gameTitle),
    gameShortTitle: shortTitle(partial.gameTitle),
    description: typeof pulledDescriptions[partial.repositoryUrl] === "string" && pulledDescriptions[partial.repositoryUrl].trim() || partial.description || null
  };
}
var EXTRA_RECORDS = [
  pcPort({
    id: "openrct2",
    description: "Open-source reimplementation of RollerCoaster Tycoon 2 with cross-platform support and active releases.",
    gameTitle: "RollerCoaster Tycoon 2",
    gameId: "openrct2",
    projectName: "OpenRCT2",
    originalReleaseYear: 2002,
    originalPlatforms: ["Windows"],
    latestVersion: "0.5.4",
    repositoryUrl: "https://github.com/OpenRCT2/OpenRCT2"
  }),
  pcPort({
    id: "devilutionx",
    description: "Modern source port of Diablo and Hellfire focused on accurate gameplay and portable builds.",
    gameTitle: "Diablo",
    gameId: "devilutionx",
    projectName: "DevilutionX",
    originalReleaseYear: 1997,
    originalPlatforms: ["Windows", "PlayStation"],
    targetPlatforms: ["Windows", "Linux", "macOS", "Android"],
    latestVersion: "1.5.4",
    repositoryUrl: "https://github.com/diasurgical/devilutionX"
  }),
  pcPort({
    id: "openmw",
    description: "Open-source engine reimplementation of The Elder Scrolls III: Morrowind with strong mod support.",
    gameTitle: "The Elder Scrolls III: Morrowind",
    gameId: "openmw",
    projectName: "OpenMW",
    completionLabel: "Fully playable; percentage not published",
    originalReleaseYear: 2002,
    originalPlatforms: ["Windows", "Xbox"],
    latestVersion: "0.49.0",
    repositoryUrl: "https://gitlab.com/OpenMW/openmw"
  }),
  pcPort({
    id: "openttd",
    description: "Long-running open-source remake of Transport Tycoon Deluxe with multiplayer support.",
    gameTitle: "Transport Tycoon Deluxe",
    gameId: "openttd",
    projectName: "OpenTTD",
    originalReleaseYear: 1995,
    originalPlatforms: ["DOS"],
    latestVersion: "15.1",
    repositoryUrl: "https://github.com/OpenTTD/OpenTTD"
  }),
  pcPort({
    id: "scummvm",
    description: "Runs hundreds of classic point-and-click adventures through reimplemented game engines.",
    gameTitle: "Classic adventure engines",
    gameId: "scummvm",
    projectName: "ScummVM",
    completionLabel: "Released; engine coverage grows per release",
    originalReleaseYear: 1990,
    originalPlatforms: ["DOS", "Windows", "Amiga"],
    latestVersion: "2.9.1",
    repositoryUrl: "https://github.com/scummvm/scummvm"
  })
];
var records = [...SEED_RECORDS.map(toTracked), ...EXTRA_RECORDS].map(withPulledRelease);
var ids = /* @__PURE__ */ new Set();
for (const record of records) {
  if (ids.has(record.id)) throw new Error(`duplicate id: ${record.id}`);
  ids.add(record.id);
  if (!record.repositoryUrl) throw new Error(`missing repository: ${record.id}`);
}
records.sort(
  (a, b) => a.gameTitle.localeCompare(b.gameTitle) || a.projectName.localeCompare(b.projectName)
);
writeFileSync(OUT, `${JSON.stringify(records, null, 2)}
`);
console.log(`wrote ${records.length} tracked projects to ${OUT}`);
console.log(
  `games: ${new Set(records.map((record) => record.gameKey)).size}, linked to catalog: ${records.filter((record) => record.gameId).length}`
);
