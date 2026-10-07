// Guards both reads and mutation continuations across owner changes/unmounts.
export class AsyncOwnerScope {
  private owner: string | undefined;
  private epoch = 0;
  private request = 0;

  activate(owner: string | undefined) { this.owner = owner; this.epoch++; this.request++; }
  dispose() { this.activate(undefined); }
  capture(owner: string) {
    const epoch = this.epoch;
    return () => this.owner === owner && this.epoch === epoch;
  }
  beginRequest(owner: string) {
    const current = this.capture(owner);
    // A stale closure must not invalidate the new owner's request.
    if (!current()) return () => false;
    const version = ++this.request;
    return () => current() && this.request === version;
  }
}
