import Foundation

// =============================================================================
// Backend — the club's real data.
//
// The app talks to the same Firebase project as thepeoplewatchingclub.com
// (`people-watching-club`), so a field note posted here shows up on the website
// and vice versa. We use the Firestore REST API over URLSession rather than the
// Firebase SDK: the collections the app touches are readable/creatable without
// a signed-in user (see firestore.rules in the people-watching-club repo), so
// the SDK would be a large dependency for two HTTP calls.
//
// The API key and the Shopify storefront token below are public client
// identifiers — the same ones already served in the website's HTML. They are
// not secrets; access is governed by the Firestore rules.
// =============================================================================

enum PWCBackend {
    static let projectID = "people-watching-club"
    static let apiKey = "AIzaSyAtjfwCh11MN3S8X1n5OlBzC3w5gWs-GgA"

    static let shopDomain = "cod-god-inc.myshopify.com"
    static let shopToken = "fffce1a7cf0342aedd0609333d90e3de"
    static let shopCollectionID = "277215117392"

    static var documentsURL: String {
        "https://firestore.googleapis.com/v1/projects/\(projectID)/databases/(default)/documents"
    }
}

// MARK: - Firestore

/// A value in Firestore's typed-JSON wire format.
enum FireValue {
    case string(String)
    case int(Int)
    case bool(Bool)
    case timestamp(Date)
    case null

    var wire: [String: Any] {
        switch self {
        case .string(let s):    return ["stringValue": s]
        case .int(let n):       return ["integerValue": String(n)]
        case .bool(let b):      return ["booleanValue": b]
        case .timestamp(let d): return ["timestampValue": FireDoc.wireFormatter.string(from: d)]
        case .null:             return ["nullValue": NSNull()]
        }
    }
}

/// One Firestore document, kept as raw typed values with typed accessors — the
/// documents are written by two different clients (this app and the website's
/// JS), so being lenient about what a field looks like is deliberate.
struct FireDoc {
    let id: String
    let fields: [String: Any]

    private func value(_ key: String) -> [String: Any]? { fields[key] as? [String: Any] }

    func string(_ key: String) -> String? { value(key)?["stringValue"] as? String }

    func int(_ key: String) -> Int? {
        guard let v = value(key) else { return nil }
        if let s = v["integerValue"] as? String { return Int(s) }
        if let n = v["integerValue"] as? Int { return n }
        if let d = v["doubleValue"] as? Double { return Int(d) }
        return nil
    }

    func date(_ key: String) -> Date? {
        guard let s = value(key)?["timestampValue"] as? String else { return nil }
        return FireDoc.fractional.date(from: s) ?? FireDoc.plain.date(from: s)
    }

    /// Firestore emits timestamps with fractional seconds; `serverTimestamp()`
    /// values written by the website sometimes come back without them.
    static let fractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    static let plain = ISO8601DateFormatter()
    static var wireFormatter: ISO8601DateFormatter { fractional }
}

enum FireError: Error, LocalizedError {
    case badResponse(Int)
    case malformed

    var errorDescription: String? {
        switch self {
        case .badResponse(let code): return "The club server said no (\(code))."
        case .malformed:             return "The club server sent something unreadable."
        }
    }
}

enum Firestore {
    /// Lists a collection. `orderBy` uses Firestore's field ordering, which
    /// silently drops documents missing that field — every writer of these
    /// collections sets `createdAt`, so that is fine here.
    static func list(_ collection: String,
                     orderBy: String? = nil,
                     descending: Bool = true,
                     limit: Int = 100) async throws -> [FireDoc] {
        var comps = URLComponents(string: "\(PWCBackend.documentsURL)/\(collection)")!
        var items = [URLQueryItem(name: "key", value: PWCBackend.apiKey),
                     URLQueryItem(name: "pageSize", value: String(limit))]
        if let orderBy {
            items.append(URLQueryItem(name: "orderBy", value: orderBy + (descending ? " desc" : " asc")))
        }
        comps.queryItems = items

        let (data, response) = try await URLSession.shared.data(from: comps.url!)
        try check(response)
        guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw FireError.malformed
        }
        // An empty collection comes back as `{}` with no `documents` key.
        let docs = root["documents"] as? [[String: Any]] ?? []
        return docs.compactMap { doc in
            guard let name = doc["name"] as? String else { return nil }
            return FireDoc(id: String(name.split(separator: "/").last ?? ""),
                           fields: doc["fields"] as? [String: Any] ?? [:])
        }
    }

    @discardableResult
    static func create(_ collection: String, fields: [String: FireValue]) async throws -> FireDoc {
        var comps = URLComponents(string: "\(PWCBackend.documentsURL)/\(collection)")!
        comps.queryItems = [URLQueryItem(name: "key", value: PWCBackend.apiKey)]

        var request = URLRequest(url: comps.url!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(
            withJSONObject: ["fields": fields.mapValues(\.wire)]
        )

        let (data, response) = try await URLSession.shared.data(for: request)
        try check(response)
        guard let doc = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let name = doc["name"] as? String else { throw FireError.malformed }
        return FireDoc(id: String(name.split(separator: "/").last ?? ""),
                       fields: doc["fields"] as? [String: Any] ?? [:])
    }

    private static func check(_ response: URLResponse) throws {
        guard let http = response as? HTTPURLResponse else { return }
        guard (200..<300).contains(http.statusCode) else {
            throw FireError.badResponse(http.statusCode)
        }
    }
}

// MARK: - Shopify

/// A product in the club shop, fetched live from the Shopify storefront.
struct ShopProduct: Identifiable, Equatable {
    let id: String
    let title: String
    let blurb: String
    let price: String
    let imageURL: URL?
    let variantID: String?
    let available: Bool
}

enum Shopify {
    /// Reads the same storefront collection the website's Buy Button shows.
    ///
    /// The store's products are not published to the Online Store channel —
    /// `onlineStoreUrl` is null and /products/<handle> 404s — so buying goes
    /// through `checkoutURL(for:)` rather than a product page link.
    static func products() async throws -> [ShopProduct] {
        let query = """
        { collection(id: "gid://shopify/Collection/\(PWCBackend.shopCollectionID)") {
            products(first: 30) { edges { node {
              id title handle description
              featuredImage { url }
              priceRange { minVariantPrice { amount currencyCode } }
              variants(first: 1) { edges { node { id availableForSale } } }
            } } } } }
        """
        var request = URLRequest(url: URL(string: "https://\(PWCBackend.shopDomain)/api/2024-10/graphql.json")!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(PWCBackend.shopToken, forHTTPHeaderField: "X-Shopify-Storefront-Access-Token")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["query": query])

        let (data, _) = try await URLSession.shared.data(for: request)
        guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let dataDict = root["data"] as? [String: Any],
              let collection = dataDict["collection"] as? [String: Any],
              let products = collection["products"] as? [String: Any],
              let edges = products["edges"] as? [[String: Any]] else { throw FireError.malformed }

        return edges.compactMap { edge in
            guard let node = edge["node"] as? [String: Any],
                  let id = node["id"] as? String,
                  let title = node["title"] as? String else { return nil }

            let image = (node["featuredImage"] as? [String: Any])?["url"] as? String
            let money = (node["priceRange"] as? [String: Any])?["minVariantPrice"] as? [String: Any]
            let variant = ((node["variants"] as? [String: Any])?["edges"] as? [[String: Any]])?
                .first?["node"] as? [String: Any]

            return ShopProduct(
                id: id,
                title: title,
                blurb: (node["description"] as? String ?? "")
                    .replacingOccurrences(of: "\n", with: " ")
                    .trimmingCharacters(in: .whitespacesAndNewlines),
                price: format(amount: money?["amount"] as? String,
                              currency: money?["currencyCode"] as? String),
                imageURL: image.flatMap(URL.init(string:)),
                variantID: variant?["id"] as? String,
                available: variant?["availableForSale"] as? Bool ?? true
            )
        }
    }

    /// Creates a Shopify cart holding this product and returns the hosted
    /// checkout to hand off to Safari. Payment always happens on Shopify.
    static func checkoutURL(for product: ShopProduct) async throws -> URL {
        guard let variantID = product.variantID else { throw FireError.malformed }
        let mutation = """
        mutation { cartCreate(input: {lines: [{quantity: 1, merchandiseId: "\(variantID)"}]}) {
          cart { checkoutUrl } userErrors { message } } }
        """
        var request = URLRequest(url: URL(string: "https://\(PWCBackend.shopDomain)/api/2024-10/graphql.json")!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(PWCBackend.shopToken, forHTTPHeaderField: "X-Shopify-Storefront-Access-Token")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["query": mutation])

        let (data, _) = try await URLSession.shared.data(for: request)
        guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let dataDict = root["data"] as? [String: Any],
              let create = dataDict["cartCreate"] as? [String: Any],
              let cart = create["cart"] as? [String: Any],
              let url = (cart["checkoutUrl"] as? String).flatMap(URL.init(string:)) else {
            throw FireError.malformed
        }
        return url
    }

    private static func format(amount: String?, currency: String?) -> String {
        guard let amount, let value = Double(amount) else { return "" }
        let f = NumberFormatter()
        f.numberStyle = .currency
        f.currencyCode = currency ?? "USD"
        f.maximumFractionDigits = value.truncatingRemainder(dividingBy: 1) == 0 ? 0 : 2
        return f.string(from: NSNumber(value: value)) ?? ""
    }
}
