import { useState } from "react";
import { getEngine, listEngines } from "@/lib/image-hosts/registry";
import { useImageHostStore } from "@/stores/imageHostStore";
import type { ImageHostId } from "@/lib/image-hosts/types";

export default function ImageHostsSection() {
  const activeHostId = useImageHostStore((s) => s.activeHostId);
  const setActiveHost = useImageHostStore((s) => s.setActiveHost);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const activeConfig = useImageHostStore((s) => s.configs[s.activeHostId as keyof typeof s.configs]);
  const activeEngine = getEngine(activeHostId);
  const canTest = activeEngine.isConfigured(activeConfig as any);

  async function runTestUpload() {
    setTesting(true); setTestResult(null);
    try {
      // 1×1 transparent PNG
      const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII="), (c) => c.charCodeAt(0));
      const file = new File([png], "test.png", { type: "image/png" });
      const { uploadWithActive } = await import("@/lib/image-hosts/dispatch");
      const res = await uploadWithActive(file);
      setTestResult(res.url);
    } catch (err) {
      setTestResult(err instanceof Error ? `错误: ${err.message}` : "错误");
    } finally { setTesting(false); }
  }

  return (
    <div data-testid="imagehost-section" style={{ maxWidth: 560 }}>
      <div className="caps" style={{ fontSize: 10, letterSpacing: "0.15em", color: "var(--gold)", marginBottom: 8 }}>
        图床
      </div>
      <div style={{ height: 1, background: "var(--border)", marginBottom: 24 }} />

      <div role="radiogroup" aria-label="图床引擎" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 24 }}>
        {listEngines().map((engine) => {
          const checked = activeHostId === engine.id;
          return (
            <label
              key={engine.id}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "8px 12px",
                border: checked ? "2px solid var(--accent)" : "1px solid var(--border)",
                borderRadius: "var(--r-md)", cursor: "pointer",
              }}
            >
              <input
                type="radio"
                name="imagehost-engine"
                value={engine.id}
                checked={checked}
                onChange={() => setActiveHost(engine.id as ImageHostId)}
                aria-label={engine.label}
              />
              <span style={{ fontFamily: "var(--f-mono)", fontSize: 12 }}>{engine.label}</span>
            </label>
          );
        })}
      </div>

      <div data-testid="imagehost-config-form">
        {activeHostId === "default" && (
          <div data-testid="imagehost-default-info" style={{ fontSize: 12, color: "var(--fg-3)", lineHeight: 1.6 }}>
            当前使用「公众号素材库」：图片会通过后端代理上传到当前激活的公众号 AppID 对应的素材库，并返回 mmbiz.qpic.cn 链接。
            如需自托管，请在上方切换到其他图床并填入凭据。
          </div>
        )}
        {activeHostId === "github" && <GithubForm />}
        {activeHostId === "aliyun" && <AliyunForm />}
        {activeHostId === "tencent-cos" && <TencentCosForm />}
        {activeHostId === "cloudflare-r2" && <CloudflareR2Form />}
      </div>

      <div style={{ marginTop: 20 }}>
        <button className="btn btn-primary btn-sm" disabled={!canTest || testing} onClick={runTestUpload}>
          {testing ? "上传中..." : "测试上传"}
        </button>
        {testResult && <div data-testid="imagehost-test-result" style={{ marginTop: 12, fontFamily: "var(--f-mono)", fontSize: 12 }}>{testResult}</div>}
      </div>

      <div data-testid="imagehost-security-note" style={{ marginTop: 32, paddingTop: 16, borderTop: "1px solid var(--border)", fontSize: 11, color: "var(--fg-4)", lineHeight: 1.6 }}>
        凭据仅保存在当前浏览器的 localStorage 中，永不发送到 MBEditor 服务端；上传时直接与各平台 API 通讯（需在对应平台 CORS 设置中放行本站域名）。
      </div>
    </div>
  );
}

function GithubForm() {
  const cfg = useImageHostStore((s) => s.configs.github);
  const setConfig = useImageHostStore((s) => s.setConfig);
  const draft = {
    repo: cfg?.repo ?? "",
    branch: cfg?.branch ?? "main",
    accessToken: cfg?.accessToken ?? "",
    useCDN: cfg?.useCDN ?? false,
  };
  function commit(patch: Partial<typeof draft>) {
    setConfig("github", { ...draft, ...patch });
  }
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <label>
        <div style={fieldLabelStyle}>仓库</div>
        <input aria-label="仓库" defaultValue={draft.repo} onBlur={(e) => commit({ repo: e.target.value })} placeholder="owner/repo" style={inputStyle} />
      </label>
      <label>
        <div style={fieldLabelStyle}>分支</div>
        <input aria-label="分支" defaultValue={draft.branch} onBlur={(e) => commit({ branch: e.target.value })} style={inputStyle} />
      </label>
      <label>
        <div style={fieldLabelStyle}>Access Token</div>
        <input aria-label="Access Token" type="password" defaultValue={draft.accessToken} onBlur={(e) => commit({ accessToken: e.target.value })} style={inputStyle} />
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input aria-label="使用 jsDelivr CDN" type="checkbox" defaultChecked={draft.useCDN} onChange={(e) => commit({ useCDN: e.target.checked })} />
        <span style={{ fontSize: 12 }}>通过 jsDelivr CDN 加速访问</span>
      </label>
    </div>
  );
}

function AliyunForm() {
  const cfg = useImageHostStore((s) => s.configs.aliyun);
  const setConfig = useImageHostStore((s) => s.setConfig);
  const draft = {
    accessKeyId: cfg?.accessKeyId ?? "",
    accessKeySecret: cfg?.accessKeySecret ?? "",
    bucket: cfg?.bucket ?? "",
    region: cfg?.region ?? "",
    customDomain: cfg?.customDomain ?? "",
  };
  function commit(patch: Partial<typeof draft>) {
    setConfig("aliyun", { ...draft, ...patch });
  }
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <label>
        <div style={fieldLabelStyle}>AccessKeyId</div>
        <input aria-label="AccessKeyId" defaultValue={draft.accessKeyId} onBlur={(e) => commit({ accessKeyId: e.target.value })} style={inputStyle} />
      </label>
      <label>
        <div style={fieldLabelStyle}>AccessKeySecret</div>
        <input aria-label="AccessKeySecret" type="password" defaultValue={draft.accessKeySecret} onBlur={(e) => commit({ accessKeySecret: e.target.value })} style={inputStyle} />
      </label>
      <label>
        <div style={fieldLabelStyle}>Bucket</div>
        <input aria-label="Bucket" defaultValue={draft.bucket} onBlur={(e) => commit({ bucket: e.target.value })} style={inputStyle} />
      </label>
      <label>
        <div style={fieldLabelStyle}>Region</div>
        <input aria-label="Region" defaultValue={draft.region} onBlur={(e) => commit({ region: e.target.value })} placeholder="oss-cn-hangzhou" style={inputStyle} />
      </label>
      <label>
        <div style={fieldLabelStyle}>自定义域名 (可选)</div>
        <input aria-label="自定义域名 (可选)" defaultValue={draft.customDomain} onBlur={(e) => commit({ customDomain: e.target.value })} style={inputStyle} />
      </label>
    </div>
  );
}

function TencentCosForm() {
  const cfg = useImageHostStore((s) => s.configs["tencent-cos"]);
  const setConfig = useImageHostStore((s) => s.setConfig);
  const draft = {
    secretId: cfg?.secretId ?? "",
    secretKey: cfg?.secretKey ?? "",
    bucket: cfg?.bucket ?? "",
    region: cfg?.region ?? "",
    customDomain: cfg?.customDomain ?? "",
  };
  function commit(patch: Partial<typeof draft>) {
    setConfig("tencent-cos", { ...draft, ...patch });
  }
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <label>
        <div style={fieldLabelStyle}>SecretId</div>
        <input aria-label="SecretId" defaultValue={draft.secretId} onBlur={(e) => commit({ secretId: e.target.value })} style={inputStyle} />
      </label>
      <label>
        <div style={fieldLabelStyle}>SecretKey</div>
        <input aria-label="SecretKey" type="password" defaultValue={draft.secretKey} onBlur={(e) => commit({ secretKey: e.target.value })} style={inputStyle} />
      </label>
      <label>
        <div style={fieldLabelStyle}>Bucket</div>
        <input aria-label="Bucket" defaultValue={draft.bucket} onBlur={(e) => commit({ bucket: e.target.value })} placeholder="my-bucket-1250000000" style={inputStyle} />
      </label>
      <label>
        <div style={fieldLabelStyle}>Region</div>
        <input aria-label="Region" defaultValue={draft.region} onBlur={(e) => commit({ region: e.target.value })} placeholder="ap-guangzhou" style={inputStyle} />
      </label>
      <label>
        <div style={fieldLabelStyle}>自定义域名 (可选)</div>
        <input aria-label="自定义域名 (可选)" defaultValue={draft.customDomain} onBlur={(e) => commit({ customDomain: e.target.value })} style={inputStyle} />
      </label>
    </div>
  );
}

function CloudflareR2Form() {
  const cfg = useImageHostStore((s) => s.configs["cloudflare-r2"]);
  const setConfig = useImageHostStore((s) => s.setConfig);
  const draft = {
    accountId: cfg?.accountId ?? "",
    accessKeyId: cfg?.accessKeyId ?? "",
    secretAccessKey: cfg?.secretAccessKey ?? "",
    bucket: cfg?.bucket ?? "",
    publicDomain: cfg?.publicDomain ?? "",
  };
  function commit(patch: Partial<typeof draft>) {
    setConfig("cloudflare-r2", { ...draft, ...patch });
  }
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <label>
        <div style={fieldLabelStyle}>Account ID</div>
        <input aria-label="Account ID" defaultValue={draft.accountId} onBlur={(e) => commit({ accountId: e.target.value })} style={inputStyle} />
      </label>
      <label>
        <div style={fieldLabelStyle}>Access Key ID</div>
        <input aria-label="Access Key ID" defaultValue={draft.accessKeyId} onBlur={(e) => commit({ accessKeyId: e.target.value })} style={inputStyle} />
      </label>
      <label>
        <div style={fieldLabelStyle}>Secret Access Key</div>
        <input aria-label="Secret Access Key" type="password" defaultValue={draft.secretAccessKey} onBlur={(e) => commit({ secretAccessKey: e.target.value })} style={inputStyle} />
      </label>
      <label>
        <div style={fieldLabelStyle}>Bucket</div>
        <input aria-label="Bucket" defaultValue={draft.bucket} onBlur={(e) => commit({ bucket: e.target.value })} style={inputStyle} />
      </label>
      <label>
        <div style={fieldLabelStyle}>Public Domain</div>
        <input aria-label="Public Domain" defaultValue={draft.publicDomain} onBlur={(e) => commit({ publicDomain: e.target.value })} style={inputStyle} />
      </label>
    </div>
  );
}

const fieldLabelStyle: React.CSSProperties = {
  fontSize: 9, letterSpacing: "0.12em", color: "var(--fg-4)", marginBottom: 4, textTransform: "uppercase",
};
const inputStyle: React.CSSProperties = {
  display: "block", width: "100%", boxSizing: "border-box",
  fontFamily: "var(--f-mono)", fontSize: 13, color: "var(--fg-2)",
  padding: "8px 0", borderBottom: "1px solid var(--border)", border: "none", background: "transparent",
};
