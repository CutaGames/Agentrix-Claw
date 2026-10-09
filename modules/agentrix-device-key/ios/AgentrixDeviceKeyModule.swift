import ExpoModulesCore
import Foundation
import LocalAuthentication
import Security

/// The phone's own P-256 device key (src/services/phoneDeviceKey.ts; contracts device-pairing-proof.ts,
/// device-signing-credential.ts).
/// - Generated in the Secure Enclave: the private key never leaves it.
/// - Access control `.privateKeyUsage` + `.userPresence`: every signature asks the owner (Face ID / Touch ID or
///   the passcode); the key only exists while a passcode is set (`WhenPasscodeSetThisDeviceOnly`).
/// - Signs ECDSA-SHA256 (X9.62) over the UTF-8 message and returns the DER signature (base64); the JS side
///   turns it into the contracts' P1363 form. Nothing here logs a message or a signature.
/// No Secure Enclave (the simulator): `secure_enclave_unavailable`, never a software key.
struct DeviceKeyError: CodedError {
  let code: String
  let description: String
}

private let keyTag = "app.agentrix.device.p256.v1".data(using: .utf8)!

public class AgentrixDeviceKeyModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AgentrixDeviceKey")

    AsyncFunction("getPublicKey") { () -> [String: String]? in
      guard let privateKey = try Self.loadPrivateKey(context: nil) else { return nil }
      return try Self.publicKeyDescription(privateKey)
    }

    AsyncFunction("createKey") { () -> [String: String] in
      if let existing = try Self.loadPrivateKey(context: nil) {
        return try Self.publicKeyDescription(existing)
      }
      return try Self.publicKeyDescription(try Self.generate())
    }

    AsyncFunction("sign") { (message: String, prompt: String) -> String in
      let context = LAContext()
      context.localizedReason = prompt
      guard let privateKey = try Self.loadPrivateKey(context: context) else {
        throw DeviceKeyError(code: "no_key", description: "no device key")
      }
      var error: Unmanaged<CFError>?
      guard let signature = SecKeyCreateSignature(
        privateKey,
        .ecdsaSignatureMessageX962SHA256,
        Data(message.utf8) as CFData,
        &error
      ) as Data? else {
        throw Self.signError(error?.takeRetainedValue())
      }
      return signature.base64EncodedString()
    }
  }

  private static func loadPrivateKey(context: LAContext?) throws -> SecKey? {
    var query: [String: Any] = [
      kSecClass as String: kSecClassKey,
      kSecAttrApplicationTag as String: keyTag,
      kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
      kSecReturnRef as String: true,
    ]
    if let context {
      query[kSecUseAuthenticationContext as String] = context
    }
    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    if status == errSecItemNotFound { return nil }
    guard status == errSecSuccess, let item else {
      throw DeviceKeyError(code: "key_unavailable", description: "keychain status \(status)")
    }
    // swiftlint:disable:next force_cast
    return (item as! SecKey)
  }

  private static func generate() throws -> SecKey {
    var error: Unmanaged<CFError>?
    guard let access = SecAccessControlCreateWithFlags(
      kCFAllocatorDefault,
      kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly,
      [.privateKeyUsage, .userPresence],
      &error
    ) else {
      throw DeviceKeyError(code: "key_unavailable", description: "access control")
    }
    let attributes: [String: Any] = [
      kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
      kSecAttrKeySizeInBits as String: 256,
      kSecAttrTokenID as String: kSecAttrTokenIDSecureEnclave,
      kSecPrivateKeyAttrs as String: [
        kSecAttrIsPermanent as String: true,
        kSecAttrApplicationTag as String: keyTag,
        kSecAttrAccessControl as String: access,
      ] as [String: Any],
    ]
    guard let key = SecKeyCreateRandomKey(attributes as CFDictionary, &error) else {
      let nsError = error?.takeRetainedValue() as Error? as NSError?
      if nsError?.code == Int(errSecNotAvailable) || nsError?.code == Int(errSecUnimplemented) {
        throw DeviceKeyError(code: "secure_enclave_unavailable", description: "no Secure Enclave")
      }
      if nsError?.code == Int(errSecAuthFailed) || nsError?.code == Int(errSecInteractionNotAllowed) {
        throw DeviceKeyError(code: "no_lock_screen", description: "set a passcode first")
      }
      throw DeviceKeyError(code: "key_unavailable", description: "create failed")
    }
    return key
  }

  /// `{ x, y, hardware }`: the public point, 32 bytes each, base64url without padding.
  private static func publicKeyDescription(_ privateKey: SecKey) throws -> [String: String] {
    guard let publicKey = SecKeyCopyPublicKey(privateKey) else {
      throw DeviceKeyError(code: "key_unavailable", description: "no public key")
    }
    var error: Unmanaged<CFError>?
    guard let raw = SecKeyCopyExternalRepresentation(publicKey, &error) as Data?,
          raw.count == 65, raw.first == 0x04 else {
      throw DeviceKeyError(code: "key_unavailable", description: "unexpected public key")
    }
    return [
      "x": base64Url(raw.subdata(in: 1..<33)),
      "y": base64Url(raw.subdata(in: 33..<65)),
      "hardware": "secure_enclave",
    ]
  }

  private static func signError(_ error: CFError?) -> DeviceKeyError {
    let nsError = error as Error? as NSError?
    if nsError?.code == Int(errSecUserCanceled)
      || (nsError?.domain == LAErrorDomain && nsError?.code == LAError.userCancel.rawValue)
      || (nsError?.domain == LAErrorDomain && nsError?.code == LAError.appCancel.rawValue)
      || (nsError?.domain == LAErrorDomain && nsError?.code == LAError.systemCancel.rawValue) {
      return DeviceKeyError(code: "user_cancelled", description: "cancelled")
    }
    return DeviceKeyError(code: "sign_failed", description: "sign failed")
  }

  private static func base64Url(_ data: Data) -> String {
    return data.base64EncodedString()
      .replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")
  }
}
