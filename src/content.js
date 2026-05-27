(function () {
  const STORAGE_KEYS = {
    apiKey: "agcGeminiApiKey",
    groqApiKey: "agcGroqApiKey",
    provider: "agcProvider",
    rules: "agcGenerationRules"
  };
  const TARGET_SELECTOR = "div.form-control.field[contenteditable='true']";

  const state = {
    apiKey: "",
    groqApiKey: "",
    provider: "gemini",
    rules: [],
    editingRuleId: null,
    expandedRuleId: null,
    activeTab: "generate",
    generatedHtml: ""
  };

  const root = document.createElement("div");
  root.id = "anki-gemini-copilot-root";
  root.innerHTML = `
    <section class="agc-panel" aria-label="Anki LLM Copilot">
      <header class="agc-header">
        <h2 class="agc-title">Anki LLM Copilot</h2>
        <button class="agc-close" type="button" aria-label="Hide">×</button>
      </header>
      <nav class="agc-tabs" role="tablist">
        <button class="agc-tab" type="button" data-tab="generate" role="tab">Generate</button>
        <button class="agc-tab" type="button" data-tab="rules" role="tab">Rules</button>
        <button class="agc-tab" type="button" data-tab="settings" role="tab">Settings</button>
      </nav>
      <div class="agc-body">
        <section class="agc-pane" data-pane="generate" role="tabpanel">
          <label class="agc-field">
            <span class="agc-label">Provider</span>
            <select class="agc-input" data-role="provider-select">
              <option value="gemini">Gemini API</option>
              <option value="groq">Groq API</option>
            </select>
          </label>
          <label class="agc-field">
            <span class="agc-label">Word</span>
            <input class="agc-input" data-role="word" type="text" placeholder="house, serendipity, ..." />
          </label>
          <div class="agc-row">
            <button class="agc-button" type="button" data-action="generate">Generate</button>
            <button class="agc-button" type="button" data-action="apply">Apply</button>
          </div>
          <div class="agc-status" data-role="generate-status"></div>
          <div class="agc-preview" data-role="preview"></div>
        </section>
        <section class="agc-pane" data-pane="rules" role="tabpanel">
          <label class="agc-field">
            <span class="agc-label">Name</span>
            <input class="agc-input" data-role="rule-name" type="text" placeholder="Card structure" />
          </label>
          <label class="agc-field">
            <span class="agc-label">Description</span>
            <textarea class="agc-textarea" data-role="rule-description" placeholder="Describe how the text should be generated..."></textarea>
          </label>
          <div class="agc-row">
            <button class="agc-button" type="button" data-action="save-rule">Save Rule</button>
            <button class="agc-button secondary" type="button" data-action="cancel-rule">Cancel</button>
          </div>
          <div class="agc-rule-list" data-role="rule-list"></div>
        </section>
        <section class="agc-pane" data-pane="settings" role="tabpanel">
          <div class="agc-status" data-role="active-provider" style="margin-bottom: 12px; padding: 8px; background: #e8f5e9; border-radius: 4px; font-size: 14px;"></div>
          <label class="agc-field">
            <span class="agc-label">Gemini API Key</span>
            <input class="agc-input" data-role="api-key" type="password" autocomplete="off" placeholder="AIza..." />
          </label>
          <label class="agc-field">
            <span class="agc-label">Groq API Key</span>
            <input class="agc-input" data-role="groq-api-key" type="password" autocomplete="off" placeholder="gsk_..." />
          </label>
          <button class="agc-button" type="button" data-action="save-key">Save Settings</button>
          <div class="agc-status" data-role="settings-status"></div>
        </section>
      </div>
    </section>
    <button class="agc-toggle" type="button" aria-label="Show or hide copilot">✦</button>
  `;

  document.documentElement.appendChild(root);

  const panel = root.querySelector(".agc-panel");
  const toggleButton = root.querySelector(".agc-toggle");
  const closeButton = root.querySelector(".agc-close");
  const tabs = Array.from(root.querySelectorAll(".agc-tab"));
  const panes = Array.from(root.querySelectorAll(".agc-pane"));
  const apiKeyInput = root.querySelector("[data-role='api-key']");
  const groqApiKeyInput = root.querySelector("[data-role='groq-api-key']");
  const providerSelect = root.querySelector("[data-role='provider-select']");
  const activeProviderStatus = root.querySelector("[data-role='active-provider']");
  const settingsStatus = root.querySelector("[data-role='settings-status']");
  const generateStatus = root.querySelector("[data-role='generate-status']");
  const wordInput = root.querySelector("[data-role='word']");
  const preview = root.querySelector("[data-role='preview']");
  const ruleNameInput = root.querySelector("[data-role='rule-name']");
  const ruleDescriptionInput = root.querySelector("[data-role='rule-description']");
  const ruleList = root.querySelector("[data-role='rule-list']");
  const saveRuleButton = root.querySelector("[data-action='save-rule']");
  const cancelRuleButton = root.querySelector("[data-action='cancel-rule']");
  const generateButton = root.querySelector("[data-action='generate']");
  const applyButton = root.querySelector("[data-action='apply']");

  function storageGet(defaults) {
    const values = { ...defaults };
    Object.keys(defaults).forEach((key) => {
      const stored = localStorage.getItem(key);
      if (stored === null) return;

      try {
        values[key] = JSON.parse(stored);
      } catch {
        values[key] = stored;
      }
    });
    return Promise.resolve(values);
  }

  function storageSet(values) {
    Object.entries(values).forEach(([key, value]) => {
      localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
    });
    return Promise.resolve();
  }

  function setActiveTab(tabName) {
    state.activeTab = tabName;
    tabs.forEach((tab) => {
      const selected = tab.dataset.tab === tabName;
      tab.setAttribute("aria-selected", String(selected));
    });
    panes.forEach((pane) => {
      pane.hidden = pane.dataset.pane !== tabName;
    });
  }

  function setStatus(element, message, isError = false) {
    element.textContent = message;
    element.classList.toggle("error", isError);
  }

  function updateActiveProviderStatus() {
    const providerName = state.provider === "gemini" ? "Gemini API" : "Groq API";
    const apiKeySet = state.provider === "gemini" ? !!state.apiKey : !!state.groqApiKey;
    const statusText = `✓ ${providerName}${apiKeySet ? " (configured)" : " (no API Key)"}`;
    activeProviderStatus.textContent = statusText;
    activeProviderStatus.style.color = apiKeySet ? "#2e7d32" : "#f57f17";
  }

  function renderRules() {
    ruleList.innerHTML = "";
    state.rules.forEach((rule) => {
      const item = document.createElement("article");
      item.className = "agc-rule";

      const title = document.createElement("button");
      title.className = "agc-rule-title";
      title.type = "button";
      title.textContent = rule.name;
      title.addEventListener("click", () => {
        state.expandedRuleId = state.expandedRuleId === rule.id ? null : rule.id;
        renderRules();
      });
      item.appendChild(title);

      if (state.expandedRuleId === rule.id) {
        const detail = document.createElement("div");
        detail.className = "agc-rule-detail";
        const description = document.createElement("div");
        description.textContent = rule.description;

        const actions = document.createElement("div");
        actions.className = "agc-row";
        const edit = document.createElement("button");
        edit.className = "agc-button secondary";
        edit.type = "button";
        edit.textContent = "Edit";
        edit.addEventListener("click", () => startEditRule(rule.id));

        const remove = document.createElement("button");
        remove.className = "agc-button danger";
        remove.type = "button";
        remove.textContent = "Delete";
        remove.addEventListener("click", () => deleteRule(rule.id));

        actions.append(edit, remove);
        detail.append(description, actions);
        item.appendChild(detail);
      }

      ruleList.appendChild(item);
    });
  }

  function resetRuleForm() {
    state.editingRuleId = null;
    ruleNameInput.value = "";
    ruleDescriptionInput.value = "";
    saveRuleButton.textContent = "Save Rule";
  }

  function startEditRule(ruleId) {
    const rule = state.rules.find((item) => item.id === ruleId);
    if (!rule) return;
    state.editingRuleId = rule.id;
    ruleNameInput.value = rule.name;
    ruleDescriptionInput.value = rule.description;
    saveRuleButton.textContent = "Update Rule";
  }

  async function persistRules() {
    await storageSet({ [STORAGE_KEYS.rules]: state.rules });
    renderRules();
  }

  async function saveRule() {
    const name = ruleNameInput.value.trim();
    const description = ruleDescriptionInput.value.trim();
    if (!name || !description) return;

    if (state.editingRuleId) {
      state.rules = state.rules.map((rule) =>
        rule.id === state.editingRuleId ? { ...rule, name, description } : rule
      );
      state.expandedRuleId = state.editingRuleId;
    } else {
      const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
      state.rules = [{ id, name, description }, ...state.rules];
      state.expandedRuleId = id;
    }

    resetRuleForm();
    await persistRules();
    setStatus(generateStatus, state.editingRuleId ? "Rule updated." : "Rule saved.");
  }

  async function deleteRule(ruleId) {
    state.rules = state.rules.filter((rule) => rule.id !== ruleId);
    if (state.expandedRuleId === ruleId) state.expandedRuleId = null;
    if (state.editingRuleId === ruleId) resetRuleForm();
    await persistRules();
  }

  function buildPrompt(word) {
    const rulesText = state.rules.length
      ? state.rules.map((rule) => `Rule: ${rule.name}\n${rule.description}`).join("\n\n")
      : "No custom rules.";

    return [
      "Generate the content for an Anki card field.",
      "Reply ONLY with valid HTML to insert inside a contenteditable div.",
      "You can use simple semantic tags like b, strong, i, em, ul, ol, li, p, br and h3.",
      "Do not include scripts, styles, markdown or explanations outside the content.",
      "",
      `Word: ${word}`,
      "",
      "Generation rules:",
      rulesText
    ].join("\n");
  }

  async function callLLM(prompt) {
    const apiKey = state.provider === "gemini" ? state.apiKey : state.groqApiKey;
    const response = await chrome.runtime.sendMessage({
      type: "AGC_GENERATE",
      apiKey: apiKey,
      prompt: prompt,
      provider: state.provider
    });

    if (!response?.ok) {
      const providerName = state.provider === "gemini" ? "Gemini" : "Groq";
      throw new Error(response?.error || `Could not generate content with ${providerName}.`);
    }

    return response.text;
  }

  function markdownToHtml(text) {
    const escaped = escapeHtml(text);
    return escaped
      .replace(/```html|```/g, "")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/\n{2,}/g, "</p><p>")
      .replace(/\n/g, "<br>");
  }

  function escapeHtml(value) {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function sanitizeHtml(value) {
    const template = document.createElement("template");
    template.innerHTML = value.trim().startsWith("<") ? value : `<p>${markdownToHtml(value)}</p>`;
    const allowedTags = new Set([
      "B",
      "BR",
      "DIV",
      "EM",
      "H3",
      "I",
      "LI",
      "OL",
      "P",
      "SPAN",
      "STRONG",
      "U",
      "UL"
    ]);

    template.content.querySelectorAll("*").forEach((node) => {
      if (!allowedTags.has(node.tagName)) {
        node.replaceWith(...Array.from(node.childNodes));
        return;
      }
      Array.from(node.attributes).forEach((attribute) => node.removeAttribute(attribute.name));
    });

    return template.innerHTML;
  }

  function findAnkiField() {
    const focused = document.activeElement;
    if (focused?.matches?.(TARGET_SELECTOR)) return focused;
    const fields = Array.from(document.querySelectorAll(TARGET_SELECTOR));
    return fields.find((field) => field.offsetParent !== null) || fields[0] || null;
  }

  function insertIntoAnki(html) {
    const target = findAnkiField();
    if (!target) {
      throw new Error("Could not find Anki editable field on this page.");
    }

    target.focus();
    target.innerHTML = html;
    target.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertHTML", data: html }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function generateText() {
    const word = wordInput.value.trim();
    const activeApiKey = state.provider === "gemini" ? state.apiKey : state.groqApiKey;

    if (!activeApiKey) {
      const providerName = state.provider === "gemini" ? "Gemini" : "Groq";
      setStatus(generateStatus, `First save your ${providerName} API Key.`, true);
      setActiveTab("settings");
      return;
    }
    if (!word) {
      setStatus(generateStatus, "Enter a word to generate.", true);
      return;
    }

    generateButton.disabled = true;
    const providerName = state.provider === "gemini" ? "Gemini" : "Groq";
    setStatus(generateStatus, `Generating with ${providerName}...`);

    try {
      const raw = await callLLM(buildPrompt(word));
      state.generatedHtml = sanitizeHtml(raw);
      preview.innerHTML = state.generatedHtml;
      setStatus(generateStatus, "Content generated. Click 'Apply' to insert into Anki.");
    } catch (error) {
      setStatus(generateStatus, error.message, true);
    } finally {
      generateButton.disabled = false;
    }
  }

  async function applyGeneratedText() {
    if (!state.generatedHtml) {
      setStatus(generateStatus, "No generated content to apply. Click 'Generate' first.", true);
      return;
    }

    try {
      insertIntoAnki(state.generatedHtml);
      setStatus(generateStatus, "Content applied to Anki.");
    } catch (error) {
      setStatus(generateStatus, error.message, true);
    }
  }

  async function init() {
    const stored = await storageGet({
      [STORAGE_KEYS.apiKey]: "",
      [STORAGE_KEYS.groqApiKey]: "",
      [STORAGE_KEYS.provider]: "gemini",
      [STORAGE_KEYS.rules]: []
    });
    state.apiKey = stored[STORAGE_KEYS.apiKey] || "";
    state.groqApiKey = stored[STORAGE_KEYS.groqApiKey] || "";
    state.provider = stored[STORAGE_KEYS.provider] || "gemini";
    state.rules = Array.isArray(stored[STORAGE_KEYS.rules]) ? stored[STORAGE_KEYS.rules] : [];
    apiKeyInput.value = state.apiKey;
    groqApiKeyInput.value = state.groqApiKey;
    providerSelect.value = state.provider;
    updateActiveProviderStatus();
    renderRules();
    setActiveTab("generate");
  }

  toggleButton.addEventListener("click", () => {
    panel.hidden = false;
  });

  closeButton.addEventListener("click", () => {
    panel.hidden = true;
  });

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => setActiveTab(tab.dataset.tab));
  });

  root.querySelector("[data-action='save-key']").addEventListener("click", async () => {
    state.apiKey = apiKeyInput.value.trim();
    state.groqApiKey = groqApiKeyInput.value.trim();
    state.provider = providerSelect.value;
    await storageSet({
      [STORAGE_KEYS.apiKey]: state.apiKey,
      [STORAGE_KEYS.groqApiKey]: state.groqApiKey,
      [STORAGE_KEYS.provider]: state.provider
    });
    updateActiveProviderStatus();
    setStatus(settingsStatus, "Settings saved.");
  });

  providerSelect.addEventListener("change", () => {
    state.provider = providerSelect.value;
    storageSet({ [STORAGE_KEYS.provider]: state.provider });
    updateActiveProviderStatus();
  });

  saveRuleButton.addEventListener("click", saveRule);
  cancelRuleButton.addEventListener("click", resetRuleForm);
  generateButton.addEventListener("click", generateText);
  applyButton.addEventListener("click", applyGeneratedText);

  init();
})();
