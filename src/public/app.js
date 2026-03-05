// FWD Policy Assistant — Chat UI
(function () {
  const chat = document.getElementById('chat');
  const input = document.getElementById('query-input');
  const sendBtn = document.getElementById('send-btn');
  const tenantSelector = document.getElementById('tenant-selector');

  let sending = false;

  // Auto-resize textarea
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  });

  // Keyboard: Enter to send, Shift+Enter for newline
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  sendBtn.addEventListener('click', sendMessage);
  input.focus();

  // Tenant switch clears chat
  tenantSelector.addEventListener('change', () => {
    chat.innerHTML = '';
    addAssistantMessage('Welcome. I can help you with your insurance policies, claims, and coverage questions. What would you like to know?');
  });

  // Example queries
  document.querySelectorAll('.examples a[data-query]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      input.value = el.dataset.query;
      input.dispatchEvent(new Event('input'));
      sendMessage();
    });
  });

  function getTenant() {
    return tenantSelector.value;
  }

  function scrollToBottom() {
    chat.scrollTo({ top: chat.scrollHeight, behavior: 'smooth' });
  }

  function addUserMessage(text) {
    const msg = document.createElement('div');
    msg.className = 'msg user';
    msg.innerHTML = `<div class="msg-bubble">${escapeHtml(text)}</div>`;
    chat.appendChild(msg);
    scrollToBottom();
  }

  function addAssistantMessage(text) {
    const msg = document.createElement('div');
    msg.className = 'msg assistant';
    msg.innerHTML = `<div class="msg-bubble">${escapeHtml(text)}</div>`;
    chat.appendChild(msg);
    scrollToBottom();
    return msg;
  }

  function createAssistantContainer() {
    const msg = document.createElement('div');
    msg.className = 'msg assistant streaming';

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    msg.appendChild(bubble);

    chat.appendChild(msg);
    scrollToBottom();

    return { container: msg, bubble };
  }

  function addThinkingIndicator() {
    const el = document.createElement('div');
    el.className = 'thinking-indicator';
    el.id = 'thinking';
    el.innerHTML = '<span>Thinking</span><span class="dots"><span>.</span><span>.</span><span>.</span></span>';
    chat.appendChild(el);
    scrollToBottom();
    return el;
  }

  async function sendMessage() {
    const query = input.value.trim();
    if (!query || sending) return;

    sending = true;
    sendBtn.disabled = true;
    input.value = '';
    input.style.height = 'auto';

    addUserMessage(query);
    const thinkingEl = addThinkingIndicator();

    try {
      const response = await fetch('/api/query/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': getTenant(),
        },
        body: JSON.stringify({ query }),
      });

      // Remove thinking indicator
      thinkingEl.remove();

      if (!response.ok) {
        addAssistantMessage('Something went wrong. Please try again.');
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      const { container, bubble } = createAssistantContainer();

      let answerText = '';
      let citations = [];
      let tools = [];
      let pipelineEvents = [];
      let safetyData = null;
      let isBlocked = false;
      let doneData = null;
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let currentEvent = '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            try {
              const data = JSON.parse(dataStr);
              handleEvent(currentEvent, data);
            } catch {
              // ignore parse errors
            }
          }
        }
      }

      function handleEvent(event, data) {
        switch (event) {
          case 'pipeline':
            pipelineEvents.push(data);
            break;

          case 'token':
            answerText = data.text || '';
            bubble.innerHTML = formatMarkdown(answerText);
            scrollToBottom();
            break;

          case 'citation':
            citations.push(data);
            break;

          case 'tool':
            tools.push(data);
            break;

          case 'safety':
            safetyData = data;
            if (data.blocked) {
              isBlocked = true;
              container.classList.add('blocked');
              if (!answerText) {
                answerText = data.reason || 'Request blocked by safety guardrails.';
                bubble.innerHTML = formatMarkdown(answerText);
              }
            }
            break;

          case 'answer':
            if (!answerText && data.content) {
              answerText = data.content;
              bubble.innerHTML = formatMarkdown(answerText);
            }
            if (data.citations) {
              citations = data.citations;
            }
            break;

          case 'done':
            doneData = data;
            if (data.pipelineEvents) {
              pipelineEvents = data.pipelineEvents;
            }
            break;
        }
      }

      // Finalize: remove streaming cursor
      container.classList.remove('streaming');

      // Render pipeline accordion
      if (pipelineEvents.length > 0 || doneData) {
        const totalMs = doneData?.latencyMs || pipelineEvents[pipelineEvents.length - 1]?.ms || 0;
        const pipelineEl = buildPipeline(pipelineEvents, totalMs, safetyData);
        container.appendChild(pipelineEl);
      }

      // Render citations
      if (citations.length > 0) {
        const citEl = buildCitations(citations);
        container.appendChild(citEl);
      }

      // Render badges
      const badgesEl = buildBadges(tools, safetyData, isBlocked);
      if (badgesEl.children.length > 0) {
        container.appendChild(badgesEl);
      }

      scrollToBottom();
    } catch (err) {
      thinkingEl?.remove();
      addAssistantMessage('Connection error. Please check if the server is running.');
    } finally {
      sending = false;
      sendBtn.disabled = false;
      input.focus();
    }
  }

  function buildPipeline(events, totalMs, safety) {
    const el = document.createElement('div');
    el.className = 'pipeline';

    const header = document.createElement('div');
    header.className = 'pipeline-header';

    const costStr = safety?.costUsd != null ? ` · $${safety.costUsd.toFixed(4)}` : '';
    header.innerHTML = `
      <div><span class="toggle">&#9654;</span>Pipeline (${events.length} steps · ${formatMs(totalMs)}${costStr})</div>
      <div class="meta"></div>
    `;

    header.addEventListener('click', () => el.classList.toggle('open'));

    const body = document.createElement('div');
    body.className = 'pipeline-body';

    for (const evt of events) {
      const step = document.createElement('div');
      step.className = 'pipeline-step';
      const icon = evt.passed === false ? '<span class="icon fail">&#10005;</span>' : '<span class="icon done">&#9675;</span>';
      let label = '';

      switch (evt.type) {
        case 'thinking':
          label = evt.content || 'Reasoning';
          break;
        case 'tool_call':
          label = `Tool: ${evt.tool}`;
          break;
        case 'retrieval':
          label = `Retrieved ${evt.results || 0} chunks`;
          break;
        case 'rerank':
          label = `Reranked: ${evt.before || '?'} → ${evt.after || '?'}`;
          break;
        case 'cache_hit':
          label = `Cache hit (${((evt.similarity || 0) * 100).toFixed(0)}% similar)`;
          break;
        case 'generation':
          label = `Generated with ${evt.model || 'gpt-4o'}${evt.tokens ? ` (${evt.tokens} tokens)` : ''}`;
          break;
        case 'guardrail':
          label = `${evt.check || 'Safety check'}: ${evt.passed ? 'passed' : 'failed'}`;
          break;
        default:
          label = evt.type;
      }

      step.innerHTML = `<div>${icon} ${escapeHtml(label)}</div><div class="timing">${formatMs(evt.ms)}</div>`;
      body.appendChild(step);
    }

    el.appendChild(header);
    el.appendChild(body);
    return el;
  }

  function buildCitations(citations) {
    const el = document.createElement('div');
    el.className = 'citations';

    for (const cite of citations) {
      const card = document.createElement('div');
      card.className = 'citation-card';
      const sourceLabel = cite.sourceId
        ? `Policy ${cite.sourceId}${cite.clause ? ', ' + cite.clause : ''}`
        : (cite.clause || 'Source');
      card.innerHTML = `<div class="source">${escapeHtml(sourceLabel)}</div>${cite.quote ? `<div class="quote">${escapeHtml(cite.quote.slice(0, 200))}</div>` : ''}`;
      el.appendChild(card);
    }

    return el;
  }

  function buildBadges(tools, safety, blocked) {
    const el = document.createElement('div');
    el.className = 'badges';

    // Tool badges
    for (const t of tools) {
      const b = document.createElement('span');
      b.className = 'badge badge-tool';
      b.textContent = formatToolName(t.name);
      el.appendChild(b);
    }

    if (blocked) {
      const b = document.createElement('span');
      b.className = 'badge badge-blocked';
      b.textContent = 'Injection blocked';
      el.appendChild(b);
      return el;
    }

    // Safety badges
    if (safety && !safety.blocked) {
      if (safety.faithfulnessScore != null) {
        const score = safety.faithfulnessScore;
        const level = score >= 7 ? 'high' : score >= 4 ? 'medium' : 'low';
        const b = document.createElement('span');
        b.className = `badge badge-safety ${level}`;
        b.textContent = `Faithfulness: ${score}/10`;
        el.appendChild(b);
      }

      if (safety.confidence) {
        const b = document.createElement('span');
        b.className = `badge badge-safety ${safety.confidence}`;
        b.textContent = `Confidence: ${safety.confidence}`;
        el.appendChild(b);
      }

      if (safety.cached) {
        const b = document.createElement('span');
        b.className = 'badge badge-cached';
        b.textContent = 'CACHED';
        el.appendChild(b);
      }
    }

    return el;
  }

  function formatToolName(name) {
    const map = {
      search_policy_documents: 'RAG Search',
      check_claim_status: 'Claim Status',
      list_claims: 'List Claims',
      get_customer_profile: 'Customer Profile',
    };
    return map[name] || name;
  }

  function formatMs(ms) {
    if (ms >= 1000) return (ms / 1000).toFixed(1) + 's';
    return ms + 'ms';
  }

  function formatMarkdown(text) {
    // Basic markdown: bold, bullet points, code
    return escapeHtml(text)
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n- /g, '\n• ')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[Policy ([A-Z]+-\d+),?\s*Section\s+([\d.]+)\]/g,
        '<span style="color:var(--info);font-family:var(--font-mono);font-size:12px">[Policy $1, Section $2]</span>');
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
})();
