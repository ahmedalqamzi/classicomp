#[cfg(feature = "desktop")]
fn main() {
    classicomp_lib::run();
}

#[cfg(not(feature = "desktop"))]
fn main() {
    eprintln!("Classicomp desktop binary requires the `desktop` cargo feature.");
}
