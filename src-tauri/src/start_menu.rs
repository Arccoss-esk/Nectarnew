use std::sync::atomic::Ordering;
use std::time::{Duration, Instant};
use windows::Win32::Foundation::{CloseHandle, HWND, POINT, RECT};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::Graphics::Gdi::{GetMonitorInfoW, MonitorFromPoint, MONITORINFO, MONITOR_DEFAULTTONEAREST};
use windows::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetWindowRect, GetWindowThreadProcessId, IsWindowVisible,
    SetWindowPos, SWP_ASYNCWINDOWPOS, SWP_NOACTIVATE, SWP_NOSIZE, SWP_NOZORDER,
};
use crate::start_menu_geometry::{position_above_button, WorkArea};

#[derive(Clone, Copy)]
pub struct StartAnchor {
    pub x: i32,
    pub y: i32,
    pub gap: i32,
}

/// Use the shell process identity, never a translated window title or an
/// arbitrary foreground window. SearchHost also hosts Start on newer Windows.
pub fn foreground_start_window() -> Option<HWND> {
    unsafe {
        let window = GetForegroundWindow();
        if window.0.is_null() || !IsWindowVisible(window).as_bool() { return None; }
        let mut pid = 0;
        GetWindowThreadProcessId(window, Some(&mut pid));
        if pid == 0 { return None; }
        let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buffer = [0u16; 1024];
        let mut len = buffer.len() as u32;
        let result = QueryFullProcessImageNameW(process, PROCESS_NAME_WIN32, windows::core::PWSTR(buffer.as_mut_ptr()), &mut len);
        let _ = CloseHandle(process);
        result.ok()?;
        let path = String::from_utf16_lossy(&buffer[..len as usize]);
        let name = path.rsplit('\\').next()?.to_ascii_lowercase();
        if name == "startmenuexperiencehost.exe" || name == "searchhost.exe" {
            Some(window)
        } else {
            None
        }
    }
}

/// Called only after a dock click opened Start. Bounded retries accommodate
/// shell animations; another toggle or a focus change cancels the operation.
pub fn position_opened_start(anchor: StartAnchor, toggle_id: i64) {
    let monitor = unsafe { MonitorFromPoint(POINT { x: anchor.x, y: anchor.y }, MONITOR_DEFAULTTONEAREST) };
    let mut info = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
    if !unsafe { GetMonitorInfoW(monitor, &mut info) }.as_bool() { return; }
    let area = WorkArea { left: info.rcWork.left, top: info.rcWork.top, right: info.rcWork.right, bottom: info.rcWork.bottom };
    let started = Instant::now();
    let mut target: Option<HWND> = None;
    let mut last_size = None;
    let mut verified = false;
    let mut attempted = false;
    while started.elapsed() < Duration::from_millis(1200) {
        std::thread::sleep(Duration::from_millis(40));
        if crate::state::LAST_START_TOGGLE_MS.load(Ordering::Relaxed) != toggle_id { return; }
        let Some(window) = foreground_start_window() else {
            if target.is_some() { break; }
            continue;
        };
        if target.is_some_and(|previous| previous != window) { break; }
        target = Some(window);
        let mut rect = RECT::default();
        if unsafe { GetWindowRect(window, &mut rect) }.is_err() { break; }
        let size = (rect.right - rect.left, rect.bottom - rect.top);
        // Wait for a real, stable rectangle before moving an animating window.
        if size.0 < 100 || size.1 < 100 || last_size != Some(size) {
            last_size = Some(size);
            continue;
        }
        let Some((x, y)) = position_above_button((anchor.x, anchor.y), size, area, anchor.gap) else {
            crate::diagnostics::log(&format!("Start positioning skipped: native size={size:?}, work area={area:?}"));
            break;
        };
        if !attempted {
            crate::diagnostics::log(&format!("Start dock anchor=({}, {}), native rect=({}, {}, {}, {}), target=({x}, {y})", anchor.x, anchor.y, rect.left, rect.top, rect.right, rect.bottom));
            attempted = true;
        }
        if (rect.left - x).abs() <= 2 && (rect.top - y).abs() <= 2 {
            verified = true;
            continue;
        }
        verified = false;
        // Preserve native size, focus and z-order; never touch Explorer's
        // taskbar settings, inject code, or resize a fullscreen Start surface.
        if let Err(error) = unsafe { SetWindowPos(window, None, x, y, 0, 0,
            SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_ASYNCWINDOWPOS) } {
            crate::diagnostics::log(&format!("Start positioning rejected: {error}"));
            break;
        }
    }
    crate::diagnostics::log(&format!("Start positioning finished: found={}, attempted={attempted}, verified={verified}", target.is_some()));
}
