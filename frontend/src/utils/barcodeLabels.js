const DEFAULT_VARIANT_TITLES = new Set([
  "default title",
  "default",
  "default variant",
]);

export const BARCODE_LABEL_PRESETS = [
  {
    id: "50x30",
    widthMm: 50,
    heightMm: 30,
    recommended: true,
  },
  {
    id: "40x30",
    widthMm: 40,
    heightMm: 30,
    recommended: false,
  },
  {
    id: "58x40",
    widthMm: 58,
    heightMm: 40,
    recommended: false,
  },
  {
    id: "70x50",
    widthMm: 70,
    heightMm: 50,
    recommended: false,
  },
];

export const DEFAULT_BARCODE_LABEL_PRESET_ID = BARCODE_LABEL_PRESETS[0].id;

export const normalizeBarcodeVariantTitle = (value, productTitle = "") => {
  const normalizedValue = String(value || "").trim();
  if (!normalizedValue) {
    return "";
  }

  const normalizedLowercaseValue = normalizedValue.toLowerCase();
  if (DEFAULT_VARIANT_TITLES.has(normalizedLowercaseValue)) {
    return "";
  }

  const normalizedProductTitle = String(productTitle || "").trim().toLowerCase();
  if (normalizedProductTitle && normalizedLowercaseValue === normalizedProductTitle) {
    return "";
  }

  return normalizedValue;
};

export const normalizeLabelCopies = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return 1;
  }

  return Math.min(200, Math.max(1, parsed));
};

export const getBarcodeLabelPresetById = (presetId) =>
  BARCODE_LABEL_PRESETS.find((preset) => preset.id === presetId) ||
  BARCODE_LABEL_PRESETS[0];

export const resolveBarcodeLabelValue = (target = {}, preferredSource = "auto") => {
  const barcode = String(target?.barcode || "").trim();
  const sku = String(target?.sku || "").trim();

  if (preferredSource === "barcode" && barcode) {
    return { source: "barcode", value: barcode };
  }

  if (preferredSource === "sku" && sku) {
    return { source: "sku", value: sku };
  }

  if (barcode) {
    return { source: "barcode", value: barcode };
  }

  if (sku) {
    return { source: "sku", value: sku };
  }

  return { source: "", value: "" };
};

export const hasPrintableBarcodeValue = (target = {}) =>
  Boolean(resolveBarcodeLabelValue(target, "auto").value);

export const hasPrintableLabelContent = (
  label = {},
  { allowTextOnly = false } = {},
) => {
  const textValues = [
    label?.title,
    label?.subtitle,
    label?.code,
    label?.vendor,
    ...(Array.isArray(label?.footerLines) ? label.footerLines : []),
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  if (allowTextOnly) {
    return textValues.length > 0;
  }

  return hasPrintableBarcodeValue(label);
};

export const getBarcodeModuleWidth = (value) => {
  const length = String(value || "").trim().length;

  if (length <= 8) {
    return 2.6;
  }

  if (length <= 12) {
    return 2.1;
  }

  if (length <= 18) {
    return 1.6;
  }

  return 1.25;
};

export const getBarcodeRenderOptions = (value) => ({
  format: "CODE128",
  displayValue: false,
  margin: 0,
  width: getBarcodeModuleWidth(value),
  height: 54,
  background: "#ffffff",
  lineColor: "#111111",
});

export const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export const buildBarcodeLabelPrintHtml = ({
  label,
  preset,
  copies,
  direction = "ltr",
}) => {
  const safeLabel = label || {};
  const safePreset = getBarcodeLabelPresetById(preset?.id);
  const normalizedCopies = normalizeLabelCopies(copies);
  const footerLines = Array.isArray(safeLabel.footerLines)
    ? safeLabel.footerLines
        .map((line) => String(line || "").trim())
        .filter(Boolean)
    : [];
  const hasBarcodeMarkup = Boolean(String(safeLabel.barcodeSvgMarkup || "").trim());
  const hasCodeText = Boolean(String(safeLabel.code || "").trim());

  const metaMarkup =
    safeLabel.vendor || safeLabel.codeSourceLabel
      ? `
        <div class="label-meta">
          <span>${escapeHtml(safeLabel.vendor || "")}</span>
          <span>${escapeHtml(safeLabel.codeSourceLabel || "")}</span>
        </div>
      `
      : "";

  const footerMarkup =
    footerLines.length > 0
      ? `
        <div class="label-footer">
          ${footerLines.map((line) => `<div>${escapeHtml(line)}</div>`).join("")}
        </div>
      `
      : "";

  const pageMarkup = `
    <section class="label-page">
      <article class="label-card" dir="${direction}">
        <div class="label-body ${hasBarcodeMarkup ? "label-body--barcode" : "label-body--text"}">
          <div class="label-header">
            <div class="label-title">${escapeHtml(safeLabel.title || "")}</div>
            ${
              safeLabel.subtitle
                ? `<div class="label-subtitle">${escapeHtml(safeLabel.subtitle)}</div>`
                : ""
            }
          </div>
          ${
            hasBarcodeMarkup
              ? `<div class="label-barcode">${safeLabel.barcodeSvgMarkup || ""}</div>`
              : ""
          }
          ${
            hasCodeText
              ? `<div class="label-code" dir="ltr">${escapeHtml(safeLabel.code || "")}</div>`
              : ""
          }
          ${metaMarkup}
        </div>
        ${footerMarkup}
      </article>
    </section>
  `;

  return `<!doctype html>
<html lang="en" dir="${direction}">
  <head>
    <meta charset="utf-8" />
    <title>Barcode Label Print</title>
    <style>
      @page {
        size: ${safePreset.widthMm}mm ${safePreset.heightMm}mm;
        margin: 0;
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        margin: 0;
        padding: 0;
        width: ${safePreset.widthMm}mm;
        background: #ffffff;
        color: #111111;
        font-family: "Segoe UI", Tahoma, Arial, sans-serif;
      }

      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      .label-page {
        width: ${safePreset.widthMm}mm;
        height: ${safePreset.heightMm}mm;
        overflow: hidden;
        break-after: page;
        page-break-after: always;
      }

      .label-page:last-child {
        break-after: auto;
        page-break-after: auto;
      }

      .label-card {
        display: flex;
        flex-direction: column;
        gap: 0.7mm;
        width: 100%;
        height: 100%;
        padding: 1.5mm;
      }

      .label-body {
        display: flex;
        min-height: 0;
        flex: 1 1 auto;
        flex-direction: column;
        gap: 0.7mm;
      }

      .label-body--text {
        justify-content: center;
      }

      .label-header {
        overflow: hidden;
      }

      .label-title {
        max-height: ${safePreset.heightMm >= 40 ? "8.4mm" : "6.8mm"};
        overflow: hidden;
        font-size: ${safePreset.heightMm >= 40 ? "3.4mm" : "3.05mm"};
        font-weight: 700;
        line-height: 1.05;
      }

      .label-subtitle {
        margin-top: 0.25mm;
        max-height: 4.8mm;
        overflow: hidden;
        font-size: 2.35mm;
        line-height: 1.05;
      }

      .label-barcode {
        display: flex;
        flex: 1 1 auto;
        min-height: 0;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }

      .label-barcode svg {
        display: block;
        width: 100%;
        max-height: ${safePreset.heightMm >= 40 ? "18mm" : "14mm"};
      }

      .label-code {
        overflow: hidden;
        white-space: nowrap;
        text-align: center;
        font-size: ${safePreset.heightMm >= 40 ? "4.1mm" : "3.7mm"};
        font-weight: 700;
        letter-spacing: 0.15mm;
        line-height: 1;
      }

      .label-meta {
        display: flex;
        justify-content: space-between;
        gap: 2mm;
        overflow: hidden;
        font-size: 2mm;
        line-height: 1.05;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: #4b5563;
      }

      .label-meta span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .label-footer {
        overflow: hidden;
        text-align: center;
        font-size: 2.1mm;
        line-height: 1.08;
      }

      .label-footer div {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    </style>
  </head>
  <body>
    ${Array.from({ length: normalizedCopies }, () => pageMarkup).join("")}
    <script>
      window.addEventListener("load", function () {
        window.setTimeout(function () {
          window.focus();
          window.print();
        }, 120);
      });

      window.addEventListener("afterprint", function () {
        window.close();
      });
    </script>
  </body>
</html>`;
};
