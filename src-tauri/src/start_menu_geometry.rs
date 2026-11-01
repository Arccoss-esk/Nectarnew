#[derive(Clone, Copy, Debug)]
pub struct WorkArea {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

/// Keep the native menu's size and place it above the button where possible.
/// Oversized/fullscreen surfaces must not be dragged partly off screen.
pub fn position_above_button(
    anchor: (i32, i32),
    size: (i32, i32),
    area: WorkArea,
    gap: i32,
) -> Option<(i32, i32)> {
    let (width, height) = size;
    if width <= 0 || height <= 0
        || width > area.right - area.left || height > area.bottom - area.top {
        return None;
    }
    Some((
        (anchor.0 - width / 2).clamp(area.left, area.right - width),
        (anchor.1 - gap - height).clamp(area.top, area.bottom - height),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    const DESKTOP: WorkArea = WorkArea { left: 0, top: 0, right: 1920, bottom: 1020 };

    #[test]
    fn centered_above_dock_button() {
        assert_eq!(position_above_button((960, 1000), (600, 700), DESKTOP, 8), Some((660, 292)));
    }
    #[test]
    fn left_and_right_buttons_keep_whole_menu_visible() {
        assert_eq!(position_above_button((50, 1000), (600, 700), DESKTOP, 8), Some((0, 292)));
        assert_eq!(position_above_button((1900, 1000), (600, 700), DESKTOP, 8), Some((1320, 292)));
    }
    #[test]
    fn tall_menu_uses_screen_top_instead_of_clipping() {
        assert_eq!(position_above_button((960, 900), (600, 1000), DESKTOP, 8), Some((660, 0)));
    }
    #[test]
    fn negative_monitor_coordinates_and_scaled_dimensions() {
        let area = WorkArea { left: -2560, top: -200, right: 0, bottom: 1180 };
        assert_eq!(position_above_button((-1280, 1150), (900, 1050), area, 12), Some((-1730, 88)));
    }
    #[test]
    fn oversized_or_invalid_surfaces_are_not_moved() {
        assert_eq!(position_above_button((50, 1000), (2200, 700), DESKTOP, 8), None);
        assert_eq!(position_above_button((50, 1000), (600, 1100), DESKTOP, 8), None);
        assert_eq!(position_above_button((50, 1000), (0, 700), DESKTOP, 8), None);
    }
}
