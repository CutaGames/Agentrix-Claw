import {
  MOBILE_V6_ROUTE_SCHEMA_VERSION,
  MOBILE_V6_TAB_ROUTE_IDS,
  MobileV6RouteCodecError,
  normalizeMobileV6Route,
  parseMobileV6Route,
  serializeMobileV6Route,
  type MobileV6Destination,
} from '../v6/routeContract';

function parsed(input: string): MobileV6Destination {
  const result = parseMobileV6Route(input);
  if (result.ok === false) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.destination;
}

function failureCode(input: string): string {
  const result = parseMobileV6Route(input);
  if (result.ok === true) throw new Error(`Expected route to fail: ${input}`);
  return result.error.code;
}

describe('Mobile V6 canonical route contract', () => {
  it('freezes the canonical four-tab IDs independently from localized labels', () => {
    expect(MOBILE_V6_TAB_ROUTE_IDS).toEqual(['SoulCore', 'Action', 'Creation', 'My']);
    expect(MOBILE_V6_ROUTE_SCHEMA_VERSION).toBe('mobile-route/v6');
  });

  it.each([
    ['/soul-core', 'SoulCore'],
    ['/soul-core?section=authority', 'SoulCore'],
    ['/actions?view=discover', 'Action'],
    ['/actions/action-1?soulCoreId=soul-1', 'ActionDetail'],
    ['/actions/action-1/trust?soulCoreId=soul-1&focus=verification', 'TrustLoopDetail'],
    ['/actions/action-1/verifications/verification-1?soulCoreId=soul-1', 'VerificationDetail'],
    ['/actions/action-1/disputes/dispute-1?soulCoreId=soul-1', 'DisputeDetail'],
    ['/assurance/subject-1?subjectKind=agent&soulCoreId=soul-1', 'AssuranceDetail'],
    ['/creation?mode=explore&filter=owned', 'Creation'],
    ['/creation/creation-1', 'CreationDetail'],
    ['/my?section=settings', 'My'],
    ['/my/devices/device-1?soulCoreId=soul-1', 'DeviceDetail'],
    ['/my/devices/soul-card?step=tap&soulCoreId=soul-1&actionId=action-1', 'SoulCardFlow'],
    ['/verify/presentation-1', 'PublicVerification'],
    ['/inbox', 'Inbox'],
    ['/scan', 'Scan'],
    ['/destination-error?reason=unsupported', 'DestinationError'],
  ])('round-trips %s', (path, route) => {
    const destination = parsed(path);
    expect(destination.route).toBe(route);
    expect(destination.schemaVersion).toBe(MOBILE_V6_ROUTE_SCHEMA_VERSION);
    expect(serializeMobileV6Route(destination)).toBe(path);
  });

  it('accepts only verified canonical origins', () => {
    expect(parsed('agentrix://actions/action-1').route).toBe('ActionDetail');
    expect(parsed('agentrix:///my?section=settings').route).toBe('My');
    expect(parsed('https://agentrix.top/creation/creation-1').route).toBe('CreationDetail');

    expect(failureCode('clawlink://actions/action-1')).toBe('unsupported_origin');
    expect(failureCode('https://clawlink.app/actions/action-1')).toBe('unsupported_origin');
    expect(failureCode('https://evil.example/actions/action-1')).toBe('unsupported_origin');
    expect(failureCode('//evil.example/actions/action-1')).toBe('unsupported_origin');
  });

  it('treats soul-card as a fixed flow route before the dynamic device route', () => {
    const soulCard = parsed('/my/devices/soul-card?step=attest');
    const device = parsed('/my/devices/device-123');
    expect(soulCard.route).toBe('SoulCardFlow');
    expect(device.route).toBe('DeviceDetail');
  });

  it('rejects unknown, duplicate, secret-bearing, and unsupported-version query params', () => {
    expect(failureCode('/actions/action-1?token=secret')).toBe('invalid_query');
    expect(failureCode('/actions/action-1?soulCoreId=a&soulCoreId=b')).toBe('invalid_query');
    expect(failureCode('/actions/action-1?v=5')).toBe('unsupported_version');
    expect(failureCode('/my/devices/soul-card?step=auto-sign')).toBe('invalid_query');
    expect(failureCode('/destination-error')).toBe('invalid_query');
  });

  it('rejects path traversal, encoded separators, credentials, malformed and oversized input', () => {
    expect(failureCode('/actions/../my')).toBe('unsafe_parameter');
    expect(failureCode('/actions/%2e%2e/my')).toBe('unsafe_parameter');
    expect(failureCode('/actions/action%2Fother')).toBe('unsafe_parameter');
    expect(failureCode('agentrix://user:pass@actions/action-1')).toBe('unsafe_parameter');
    expect(failureCode('/actions/%E0%A4%A')).toBe('malformed_url');
    expect(failureCode(`/actions/${'a'.repeat(2_100)}`)).toBe('input_too_long');
  });

  it('rejects invalid IDs rather than forwarding an arbitrary route', () => {
    expect(failureCode('/actions/action id')).toBe('invalid_identifier');
    expect(failureCode('/verify/presentation!')).toBe('invalid_identifier');
    expect(failureCode('/future/feature')).toBe('unknown_route');
  });

  it('canonicalization is idempotent', () => {
    const first = normalizeMobileV6Route('agentrix://actions/action-1/trust?focus=verification');
    if (first.ok === false) throw new Error(first.error.message);
    expect(first.path).toBe('/actions/action-1/trust?focus=verification');

    const second = normalizeMobileV6Route(first.path);
    if (second.ok === false) throw new Error(second.error.message);
    expect(second.path).toBe(first.path);
  });

  it('fails closed when a forged destination reaches the serializer', () => {
    expect(() => serializeMobileV6Route({
      schemaVersion: MOBILE_V6_ROUTE_SCHEMA_VERSION,
      route: 'ActionDetail',
      params: { actionId: '../admin' },
    } as MobileV6Destination)).toThrow(MobileV6RouteCodecError);

    expect(() => serializeMobileV6Route({
      schemaVersion: 'mobile-route/v5',
      route: 'My',
      params: {},
    } as unknown as MobileV6Destination)).toThrow(MobileV6RouteCodecError);
  });
});
