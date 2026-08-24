import ExpoModulesCore
import MapKit

private let resultLimit = 5
private let suggestionCacheLimit = 50
private let germanyRegion = MKCoordinateRegion(
  center: CLLocationCoordinate2D(latitude: 51.1657, longitude: 10.4515),
  span: MKCoordinateSpan(latitudeDelta: 9.0, longitudeDelta: 12.0)
)

public final class PflegeShiftMapSearchModule: Module {
  private let searchService = PflegeShiftMapSearchService()

  public func definition() -> ModuleDefinition {
    Name("PflegeShiftMapSearch")

    AsyncFunction("completeAsync") { (query: String, promise: Promise) in
      searchService.complete(query: query, promise: promise)
    }
    .runOnQueue(.main)

    AsyncFunction("resolveAsync") { (identifier: String, promise: Promise) in
      searchService.resolve(identifier: identifier, promise: promise)
    }
    .runOnQueue(.main)

    OnDestroy {
      searchService.cancel()
    }
  }
}

private final class PflegeShiftMapSearchService: NSObject, MKLocalSearchCompleterDelegate {
  private let completer = MKLocalSearchCompleter()
  private var pendingCompletionPromise: Promise?
  private var suggestionCache: [String: MKLocalSearchCompletion] = [:]
  private var suggestionOrder: [String] = []
  private var activeSearches: [UUID: MKLocalSearch] = [:]

  override init() {
    super.init()
    completer.delegate = self
    completer.region = germanyRegion
    completer.resultTypes = [.address, .pointOfInterest]
  }

  func complete(query: String, promise: Promise) {
    pendingCompletionPromise?.resolve([])
    pendingCompletionPromise = nil

    let trimmedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines)
    guard trimmedQuery.count >= 3 else {
      promise.resolve([])
      completer.queryFragment = ""
      return
    }

    pendingCompletionPromise = promise
    completer.queryFragment = trimmedQuery
  }

  func resolve(identifier: String, promise: Promise) {
    guard let completion = suggestionCache[identifier] else {
      promise.reject("ERR_MAP_SEARCH_EXPIRED", "Der Adressvorschlag ist nicht mehr verfügbar.")
      return
    }

    let request = MKLocalSearch.Request(completion: completion)
    request.region = germanyRegion
    request.resultTypes = [.address, .pointOfInterest]
    let search = MKLocalSearch(request: request)
    let searchIdentifier = UUID()
    activeSearches[searchIdentifier] = search

    search.start { [weak self] response, error in
      DispatchQueue.main.async {
        self?.activeSearches[searchIdentifier] = nil
        if let error {
          promise.reject("ERR_MAP_SEARCH_RESOLVE", error.localizedDescription)
          return
        }
        guard let mapItem = response?.mapItems.first else {
          promise.reject("ERR_MAP_SEARCH_EMPTY", "Für diesen Vorschlag wurde keine Adresse gefunden.")
          return
        }

        let coordinate = mapItem.placemark.coordinate
        guard CLLocationCoordinate2DIsValid(coordinate) else {
          promise.reject("ERR_MAP_SEARCH_COORDINATE", "MapKit hat ungültige Koordinaten geliefert.")
          return
        }

        let name = mapItem.name?.trimmingCharacters(in: .whitespacesAndNewlines)
        let fallbackName = completion.title.trimmingCharacters(in: .whitespacesAndNewlines)
        let resolvedName = name?.isEmpty == false ? name ?? fallbackName : fallbackName
        let placemarkTitle = mapItem.placemark.title?.trimmingCharacters(in: .whitespacesAndNewlines)
        let completionSubtitle = completion.subtitle.trimmingCharacters(in: .whitespacesAndNewlines)
        let namePrefix = "\(resolvedName), "
        let fullAddress = placemarkTitle?.isEmpty == false
          ? placemarkTitle ?? completionSubtitle
          : completionSubtitle
        let address = fullAddress.hasPrefix(namePrefix)
          ? String(fullAddress.dropFirst(namePrefix.count))
          : fullAddress

        promise.resolve([
          "name": resolvedName,
          "address": address,
          "latitude": coordinate.latitude,
          "longitude": coordinate.longitude
        ])
      }
    }
  }

  func cancel() {
    pendingCompletionPromise?.resolve([])
    pendingCompletionPromise = nil
    completer.queryFragment = ""
    activeSearches.values.forEach { $0.cancel() }
    activeSearches.removeAll()
    suggestionCache.removeAll()
    suggestionOrder.removeAll()
  }

  func completerDidUpdateResults(_ completer: MKLocalSearchCompleter) {
    guard let promise = pendingCompletionPromise else { return }
    pendingCompletionPromise = nil

    var seen = Set<String>()
    var exportedResults: [[String: String]] = []
    for completion in completer.results {
      let title = completion.title.trimmingCharacters(in: .whitespacesAndNewlines)
      let subtitle = completion.subtitle.trimmingCharacters(in: .whitespacesAndNewlines)
      let deduplicationKey = "\(title.lowercased())|\(subtitle.lowercased())"
      guard !title.isEmpty, seen.insert(deduplicationKey).inserted else { continue }

      let identifier = UUID().uuidString
      suggestionCache[identifier] = completion
      suggestionOrder.append(identifier)
      exportedResults.append([
        "id": identifier,
        "title": title,
        "subtitle": subtitle
      ])
      if exportedResults.count == resultLimit { break }
    }
    trimSuggestionCache()
    promise.resolve(exportedResults)
  }

  func completer(_ completer: MKLocalSearchCompleter, didFailWithError error: Error) {
    pendingCompletionPromise?.reject("ERR_MAP_SEARCH_COMPLETE", error.localizedDescription)
    pendingCompletionPromise = nil
  }

  private func trimSuggestionCache() {
    while suggestionOrder.count > suggestionCacheLimit {
      let identifier = suggestionOrder.removeFirst()
      suggestionCache[identifier] = nil
    }
  }
}
