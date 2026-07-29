#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    fieldflow_activity_agent_lib::run();
}
