type Props = {
  accountId: string;
  loading: boolean;
  error?: string;
  onStartCheckout: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
};

export function AccountScreen({
  accountId,
  loading,
  error,
  onStartCheckout,
  onConnect,
  onDisconnect,
}: Props) {
  const hasAccount = accountId.startsWith("acct_");

  return (
    <div className="screen">
      <h1 className="title">Aether Terminal</h1>
      <p className="subtitle">iPhone web terminal — card entry checkout on the Aether network.</p>

      <div className="label">Your account ID</div>
      <div className="account-box">
        {loading ? "Loading…" : hasAccount ? accountId : "Not linked yet"}
      </div>

      {!hasAccount && !loading ? (
        <>
          <p className="subtitle" style={{ marginTop: "1.25rem" }}>
            Create your merchant account. After Stripe setup you return here automatically.
          </p>
          <button className="btn btn-primary" onClick={onConnect}>
            Create Aether account
          </button>
        </>
      ) : null}

      {hasAccount ? (
        <>
          <button className="btn btn-primary" style={{ marginTop: "1.25rem" }} onClick={onStartCheckout}>
            Start accepting payments
          </button>
          <button className="btn btn-secondary" onClick={onDisconnect}>
            Disconnect account
          </button>
        </>
      ) : null}

      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
