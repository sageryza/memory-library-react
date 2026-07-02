import Foundation
import CoreLocation

/// One-shot "where am I" → city name. Triggers the system location popup on
/// first use, grabs a single coarse fix, reverse-geocodes it to a locality.
/// Everything falls back to typing the city manually — location is optional.
final class CityFinder: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published var busy = false
    @Published var error: String?

    private let manager = CLLocationManager()
    private var completion: ((String?) -> Void)?

    func locate(_ done: @escaping (String?) -> Void) {
        DispatchQueue.main.async { self.busy = true; self.error = nil }
        completion = done
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyKilometer
        switch manager.authorizationStatus {
        case .notDetermined:
            manager.requestWhenInUseAuthorization()   // system popup; resumes in the delegate
        case .denied, .restricted:
            finish(nil)
        default:
            manager.requestLocation()
        }
    }

    func locationManagerDidChangeAuthorization(_ m: CLLocationManager) {
        guard completion != nil else { return }
        switch m.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways: m.requestLocation()
        case .denied, .restricted: finish(nil)
        default: break   // still .notDetermined while the popup is up
        }
    }

    func locationManager(_ m: CLLocationManager, didUpdateLocations locs: [CLLocation]) {
        guard let loc = locs.first else { return finish(nil) }
        CLGeocoder().reverseGeocodeLocation(loc) { [weak self] places, _ in
            let p = places?.first
            self?.finish(p?.locality ?? p?.subAdministrativeArea)
        }
    }

    func locationManager(_ m: CLLocationManager, didFailWithError e: Error) {
        finish(nil)
    }

    private func finish(_ city: String?) {
        DispatchQueue.main.async {
            self.busy = false
            self.error = city == nil ? "Couldn't detect your city — type it instead." : nil
            self.completion?(city)
            self.completion = nil
        }
    }
}
