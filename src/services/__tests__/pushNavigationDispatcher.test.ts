/**
 * M2 slice B1 — push landing (MTR-R10.1 step one, MTR-R04.5): cold start and
 * warm resume reach the same `WorkApprovals { approvalRef, source: 'push' }`.
 */
import { resolvePushDestination } from "../pushDestination";
import {
  createPushNavigationDispatcher,
  pushDestinationToNavigationTarget,
} from "../pushNavigationDispatcher";

const APPROVAL_PUSH = {
  type: "approval_required",
  approvalRef: "apr_d6be74f7",
  risk: "high",
};

function fakeNavigation(ready: boolean) {
  const calls: unknown[][] = [];
  return {
    calls,
    nav: {
      navigate: (...args: unknown[]) => {
        calls.push(args);
      },
      isReady: () => ready,
    },
  };
}

describe("pushDestinationToNavigationTarget", () => {
  it("maps approval_required to Work › WorkApprovals with the ref and source=push, nothing else from the payload", () => {
    const target = pushDestinationToNavigationTarget(
      resolvePushDestination(APPROVAL_PUSH),
    );
    expect(target).toEqual({
      tab: "Work",
      screen: "WorkApprovals",
      params: { approvalRef: "apr_d6be74f7", source: "push" },
    });
    // `risk` / `expiresAt` are hints for the lock screen only — never routed.
    expect(JSON.stringify(target)).not.toContain("high");
  });

  it("has no target for surfaces outside the M2.2 inbox and for error destinations", () => {
    expect(
      pushDestinationToNavigationTarget(
        resolvePushDestination({ type: "handoff_ready", handoffRef: "hnd_1" }),
      ),
    ).toBeNull();
    expect(
      pushDestinationToNavigationTarget(resolvePushDestination({ type: "nope" })),
    ).toBeNull();
  });

  it("refuses an approval ref the Work face would refuse (alphabet narrower than the push layer's)", () => {
    // `:` passes the push SAFE_REF but not the DRW bounded opaque ref.
    const destination = resolvePushDestination({
      type: "approval_required",
      approvalRef: "apr:with:colons",
    });
    expect(destination.ok).toBe(true);
    expect(pushDestinationToNavigationTarget(destination)).toBeNull();
  });
});

describe("createPushNavigationDispatcher", () => {
  it("warm resume: navigator ready + authenticated → navigates immediately", () => {
    const { nav, calls } = fakeNavigation(true);
    const dispatcher = createPushNavigationDispatcher({
      getNavigation: () => nav,
      isAuthenticated: () => true,
      onUnroutable: () => {
        throw new Error("unexpected");
      },
    });
    expect(dispatcher.dispatch(resolvePushDestination(APPROVAL_PUSH))).toBe("navigated");
    expect(calls).toEqual([
      [
        "Work",
        {
          screen: "WorkApprovals",
          params: { approvalRef: "apr_d6be74f7", source: "push" },
        },
      ],
    ]);
    expect(dispatcher.pending()).toBeNull();
  });

  it("cold start: deferred until the navigator is ready AND the session is authenticated, then delivered once with the same params", () => {
    let ready = false;
    let authenticated = false;
    const calls: unknown[][] = [];
    const nav = {
      navigate: (...args: unknown[]) => {
        calls.push(args);
      },
      isReady: () => ready,
    };
    const dispatcher = createPushNavigationDispatcher({
      getNavigation: () => nav,
      isAuthenticated: () => authenticated,
      onUnroutable: () => {
        throw new Error("unexpected");
      },
    });
    expect(dispatcher.dispatch(resolvePushDestination(APPROVAL_PUSH))).toBe("deferred");
    expect(dispatcher.pending()).not.toBeNull();
    expect(dispatcher.flush()).toBe(false); // neither ready nor authenticated
    ready = true;
    expect(dispatcher.flush()).toBe(false); // ready but the session is not restored yet
    authenticated = true;
    expect(dispatcher.flush()).toBe(true);
    expect(dispatcher.flush()).toBe(false); // delivered exactly once
    expect(calls).toEqual([
      [
        "Work",
        {
          screen: "WorkApprovals",
          params: { approvalRef: "apr_d6be74f7", source: "push" },
        },
      ],
    ]);
  });

  it("a newer approval push replaces an undelivered one (latest tap wins)", () => {
    const { nav, calls } = fakeNavigation(false);
    const dispatcher = createPushNavigationDispatcher({
      getNavigation: () => nav,
      isAuthenticated: () => true,
      onUnroutable: () => {},
    });
    dispatcher.dispatch(resolvePushDestination({ ...APPROVAL_PUSH, approvalRef: "apr_1" }));
    dispatcher.dispatch(resolvePushDestination({ ...APPROVAL_PUSH, approvalRef: "apr_2" }));
    expect(dispatcher.pending()?.params.approvalRef).toBe("apr_2");
    expect(calls).toHaveLength(0);
  });

  it("malformed / unknown payloads go to destination-error; other surfaces are recorded, never guessed", () => {
    const { nav, calls } = fakeNavigation(true);
    const unroutable: unknown[] = [];
    const recorded: unknown[] = [];
    const dispatcher = createPushNavigationDispatcher({
      getNavigation: () => nav,
      isAuthenticated: () => true,
      onUnroutable: (destination) => unroutable.push(destination),
      onRecorded: (destination) => recorded.push(destination),
    });
    expect(dispatcher.dispatch(resolvePushDestination({ type: "nope" }))).toBe("unroutable");
    expect(dispatcher.dispatch(resolvePushDestination(null))).toBe("unroutable");
    expect(
      dispatcher.dispatch(
        resolvePushDestination({ type: "approval_required", approvalRef: "bad:ref" }),
      ),
    ).toBe("unroutable");
    expect(
      dispatcher.dispatch(
        resolvePushDestination({ type: "handoff_ready", handoffRef: "hnd_1" }),
      ),
    ).toBe("recorded");
    expect(unroutable).toHaveLength(3);
    expect(recorded).toHaveLength(1);
    expect(calls).toHaveLength(0);
    expect(dispatcher.pending()).toBeNull();
  });

  it("a navigator that throws is not treated as delivered", () => {
    const dispatcher = createPushNavigationDispatcher({
      getNavigation: () => ({
        navigate: () => {
          throw new Error("param list mismatch");
        },
        isReady: () => true,
      }),
      isAuthenticated: () => true,
      onUnroutable: () => {},
    });
    expect(dispatcher.dispatch(resolvePushDestination(APPROVAL_PUSH))).toBe("deferred");
    expect(dispatcher.pending()).not.toBeNull();
  });
});
