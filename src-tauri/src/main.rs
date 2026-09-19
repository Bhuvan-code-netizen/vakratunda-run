// Prevents an extra console window from opening alongside the game on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    vakratunda_run_lib::run()
}
