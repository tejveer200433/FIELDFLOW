use std::sync::atomic::{AtomicU64, Ordering};

use crate::models::InputActivityCounts;

static KEYBOARD_EVENTS: AtomicU64 = AtomicU64::new(0);
static MOUSE_EVENTS: AtomicU64 = AtomicU64::new(0);

pub fn take_counts() -> InputActivityCounts {
    InputActivityCounts {
        keyboard_event_count: KEYBOARD_EVENTS.swap(0, Ordering::Relaxed),
        mouse_event_count: MOUSE_EVENTS.swap(0, Ordering::Relaxed),
    }
}

#[cfg(test)]
mod tests {
    use super::take_counts;

    #[test]
    fn safe_fallback_never_records_input_content_or_events() {
        let counts = take_counts();
        assert_eq!(counts.keyboard_event_count, 0);
        assert_eq!(counts.mouse_event_count, 0);
    }
}
