/*
 * WiseBot_widget_premium.js
 * Version: Premium (dev + minified below)
 * Features ajoutées:
 * - Multi-langues (FR/EN) + détection automatique + override via config.lang
 * - Thèmes (light / dark / custom) via CSS variables
 * - Compteur de messages non lus sur la bulle
 * - Animations fluides
 * - Auto-scroll intelligent (ne scrolle que si l'utilisateur est en bas)
 * - Hooks / callbacks : onOpen, onClose, onMessageSent, onMessageReceived
 * - Optimisations: CSS variables, faible empreinte, option streaming
 * - Envoi de la langue au backend (n8n) via payload.session
 *
 * Usage:
 * <script src="WiseBot_widget_premium.js"></script>
 * <script>
 *   FloatingChatWidget.init({ apiUrl: 'https://...', lang: 'auto', theme: 'dark', debug: true });
 *   FloatingChatWidget.onOpen(() => console.log('open'));
 * </script>
 */

const DEFAULT_CONFIG = {
  apiUrl: 'https://primary-production-33255.up.railway.app/webhook/3b85a429-6ab2-42ec-a6be-98528860366b/chat',
  position: 'bottom-right',
  theme: 'dark', // 'dark' or 'light' or 'custom'
  customColors: {}, // override CSS variables when theme==='custom'
  bubbleIcon: '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path fill="currentColor" d="M12 3C7 3 3.5 6.5 3.5 10.6c0 2.3 1 4.4 2.7 5.9V21l3.4-1.9c.9.2 1.9.3 2.9.3 5 0 8.5-3.5 8.5-7.6S17 3 12 3z"></path></svg>',
  title: 'WiseBot',
  placeholder: '', // will be filled by translations
  welcomeMessage: '', // will be filled by translations
  zIndex: 9999,
  width: 370,
  height: 580,
  fontFamily: 'inherit',
  debug: false,
  sessionId: undefined,
  lang: 'auto', // 'auto' | 'en' | 'fr' | ...
  fallbackLang: 'fr',
  translations: {
    fr: {
      placeholder: 'Écrivez votre message...',
      welcomeMessage: 'Bienvenue ! <br> Je suis WiseBot, l’assistant virtuel. Comment puis-je vous aider aujourd’hui ?',
      suggestions: [
        { text: 'À propos de W.I.S.E.', message: "J’aimerais avoir des informations sur votre entreprise." },
        { text: 'Qu’est-ce que WiseBot ?', message: "Qu'est-ce que WiseBot ?" },
        { text: 'Nos services', message: "Quels sont vos services ?" }
      ],
      onlineText: 'En ligne'
    },
    en: {
      placeholder: 'Type your message...',
      welcomeMessage: 'Welcome! <br> I am WiseBot, your virtual assistant. How can I help you today?',
      suggestions: [
        { text: 'About W.I.S.E.', message: 'I would like information about your company.' },
        { text: 'About WiseBot', message: 'What is WiseBot?' },
        { text: 'Our services', message: 'What services do you offer?' }
      ],
      onlineText: 'Online'
    }
  }
};

(function (window, document) {
  'use strict';

  function log(...args) { if (FloatingChatWidget._config && FloatingChatWidget._config.debug) console.log('[FloatingChatWidget]', ...args); }

  const FloatingChatWidget = {
    _config: {},
    _elements: {},
    _isOpen: false,
    _unread: 0,
    _onUserRequest: null,
    _callbacks: { open: [], close: [], messageSent: [], messageReceived: [] },
    _hasOpenedChat: false,

    init(config = {}) {
      this._config = Object.assign({}, DEFAULT_CONFIG, config);
      if (!this._config.sessionId) this._config.sessionId = 'fcw-' + Math.random().toString(36).slice(2) + Date.now();

      // Resolve language
      const resolvedLang = this._resolveLanguage(this._config.lang);
      this._config.lang = resolvedLang;
      const trans = this._config.translations[resolvedLang] || this._config.translations[this._config.fallbackLang];
      this._config.placeholder = this._config.placeholder || trans.placeholder;
      this._config.welcomeMessage = this._config.welcomeMessage || trans.welcomeMessage;
      this._config._suggestions = trans.suggestions || [];
      this._config.onlineText = trans.onlineText || 'Online';

      log('Initializing with config:', this._config);
      this._createStyles();
      this._createWidget();
      this._bindEvents();
      this._createWelcomePopup();
      if (this._config.welcomeMessage) {
        this._addMessage('bot', this._config.welcomeMessage);
        this._createSuggestionButtons();
      }
    },

    // Public hooks registration
    onOpen(fn) { if (typeof fn === 'function') this._callbacks.open.push(fn); },
    onClose(fn) { if (typeof fn === 'function') this._callbacks.close.push(fn); },
    onMessageSent(fn) { if (typeof fn === 'function') this._callbacks.messageSent.push(fn); },
    onMessageReceived(fn) { if (typeof fn === 'function') this._callbacks.messageReceived.push(fn); },

    onUserRequest(callback) { this._onUserRequest = callback; },

    reply(text) { this._addMessage('bot', text); },

    _resolveLanguage(pref) {
      if (pref && pref !== 'auto') return pref;
      const nav = (navigator.language || navigator.userLanguage || '').toLowerCase();
      const short = nav.split('-')[0];
      if (short && this._hasTranslation(short)) return short;
      if (nav && this._hasTranslation(nav)) return nav;
      return DEFAULT_CONFIG.fallbackLang;
    },

    _hasTranslation(code) { return Boolean(this._config.translations && this._config.translations[code]); },

    _createStyles() {
      if (document.getElementById('fcw-style')) return;
      const style = document.createElement('style');
      style.id = 'fcw-style';

      // CSS variables for themes
      const vars = {
        '--fcw-width': this._config.width + 'px',
        '--fcw-height': this._config.height + 'px',
        '--fcw-radius': '16px',
        '--fcw-primary': this._config.theme === 'light' ? '#1aa6ff' : '#70c7ff',
        '--fcw-bg': this._config.theme === 'light' ? '#ffffff' : '#1f1f1f',
        '--fcw-foreground': this._config.theme === 'light' ? '#111827' : '#f8fafc',
        '--fcw-muted': '#666666'
      };

      // If custom colors provided, override
      if (this._config.theme === 'custom' && typeof this._config.customColors === 'object') {
        Object.keys(this._config.customColors).forEach(k => vars[`--${k}`] = this._config.customColors[k]);
      }

      let varsString = ':root {';
      for (const k in vars) varsString += `${k}: ${vars[k]};`;
      varsString += '}';

      style.textContent = `${varsString}

.fcw-bubble{position:fixed;${this._config.position==='bottom-left'?'left:24px;':'right:24px;'}bottom:24px;z-index:${this._config.zIndex};width:56px;height:56px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.6rem;box-shadow:0 6px 20px rgba(0,0,0,0.15);cursor:pointer;transition:transform .18s,box-shadow .18s}
.fcw-bubble:hover{transform:scale(1.06);box-shadow:0 10px 30px rgba(0,0,0,0.2)}
.fcw-unread{position:absolute;top:-6px;right:-6px;background:var(--fcw-primary);color:#fff;border-radius:12px;padding:2px 6px;font-size:0.7rem;min-width:20px;text-align:center}
.fcw-widget{position:fixed;${this._config.position==='bottom-left'?'left:24px;':'right:24px;'}bottom:90px;z-index:${this._config.zIndex};width:var(--fcw-width);max-width:95vw;height:var(--fcw-height);max-height:80vh;background:var(--fcw-bg);border-radius:var(--fcw-radius);box-shadow:0 12px 40px rgba(0,0,0,0.25);display:flex;flex-direction:column;overflow:hidden;opacity:0;pointer-events:none;transform:translateY(20px) scale(.98);transition:opacity .28s,transform .28s}
.fcw-widget.open{opacity:1;pointer-events:auto;transform:translateY(0) scale(1)}
.fcw-header{background:linear-gradient(90deg,var(--fcw-primary),#3fb0ff);padding:12px 14px;color:#fff;display:flex;align-items:center;justify-content:space-between}
.fcw-header-left{display:flex;align-items:center;gap:10px}
.fcw-avatar{width:40px;height:40px;border-radius:50%;background:#fff;flex-shrink:0}
.fcw-header-title{font-weight:700;font-size:1rem}
.fcw-header-info{display:flex;flex-direction:column}
.fcw-status{font-size:0.8rem;color:rgba(255,255,255,0.9)}
.fcw-messages{flex:1;padding:14px;overflow:auto;background:transparent;color:var(--fcw-foreground);font-family:${this._config.fontFamily}}
.fcw-message{margin-bottom:12px;display:flex;align-items:flex-end}
.fcw-message.user{justify-content:flex-end}
.fcw-message.bot{justify-content:flex-start}
.fcw-message .fcw-bubble-text{border-radius:12px;padding:10px 14px;max-width:80%;font-size:0.96rem;box-shadow:0 4px 18px rgba(0,0,0,0.08)}
.fcw-message.user .fcw-bubble-text{background:var(--fcw-primary);color:#000}
.fcw-message.bot .fcw-bubble-text{background:rgba(255,255,255,0.06);color:var(--fcw-foreground)}
.fcw-input-row{display:flex;align-items:center;padding:8px;border-top:1px solid rgba(255,255,255,0.04);background:transparent}
.fcw-input{flex:1;border:none;padding:10px;border-radius:10px;font-size:1rem;resize:none;background:rgba(255,255,255,0.02);color:var(--fcw-foreground);outline:none}
.fcw-send-btn{background:none;border:none;color:var(--fcw-primary);font-size:1.2rem;padding:8px;cursor:pointer}
.fcw-loading{display:inline-flex;align-items:center;gap:6px;color:var(--fcw-muted)}
.fcw-loading span{display:inline-block;width:6px;height:6px;border-radius:50%;background:currentColor;animation:fcw-wave 1.2s linear infinite}
@keyframes fcw-wave{0%{opacity:.3;transform:translateY(0)}50%{opacity:1;transform:translateY(-6px)}100%{opacity:.3;transform:translateY(0)}}
.fcw-suggestions{padding:12px;display:flex;flex-wrap:wrap;gap:8px}
.fcw-suggestion-btn{background:transparent;border:1px solid rgba(255,255,255,0.08);padding:8px 10px;border-radius:8px;color:var(--fcw-foreground);cursor:pointer}
.fcw-welcome-popup{position:fixed;${this._config.position==='bottom-left'?'left:90px;':'right:90px;'}bottom:35px;z-index:${this._config.zIndex+1};background:var(--fcw-primary);color:#fff;padding:10px 14px;border-radius:12px;box-shadow:0 6px 30px rgba(0,0,0,0.18);opacity:0;transform:translateY(8px);transition:all .28s}
.fcw-welcome-popup.show{opacity:1;transform:translateY(0)}
`;      
      document.head.appendChild(style);
    },

    _createWidget() {
      // bubble
      const bubble = document.createElement('div');
      bubble.className = 'fcw-bubble';
      bubble.innerHTML = this._config.bubbleIcon;
      const unread = document.createElement('div');
      unread.className = 'fcw-unread';
      unread.style.display = 'none';
      unread.textContent = '0';
      bubble.appendChild(unread);
      document.body.appendChild(bubble);

      const widget = document.createElement('div');
      widget.className = 'fcw-widget';
      widget.innerHTML = `
      <div class="fcw-header">
        <div class="fcw-header-left">
          <div class="fcw-avatar" aria-hidden></div>
          <div class="fcw-header-info">
            <div class="fcw-header-title">${this._config.title}</div>
            <div class="fcw-status"><span class="fcw-status-dot"></span> ${this._config.onlineText}</div>
          </div>
        </div>
        <div>
          <button class="fcw-minimize-btn" aria-label="minimize">−</button>
          <button class="fcw-close-btn" aria-label="close">✕</button>
        </div>
      </div>
      <div class="fcw-messages" role="log" aria-live="polite"></div>
      <form class="fcw-input-row" autocomplete="off">
        <textarea class="fcw-input" placeholder="${this._config.placeholder}" rows="1"></textarea>
        <button class="fcw-send-btn" type="submit">➤</button>
      </form>
      `;
      document.body.appendChild(widget);

      this._elements = {
        bubble,
        unread,
        widget,
        messages: widget.querySelector('.fcw-messages'),
        input: widget.querySelector('.fcw-input'),
        form: widget.querySelector('.fcw-input-row'),
        sendBtn: widget.querySelector('.fcw-send-btn'),
        closeBtn: widget.querySelector('.fcw-close-btn'),
        minimizeBtn: widget.querySelector('.fcw-minimize-btn')
      };

      // track if user is scrolled to bottom
      this._userAtBottom = true;
      this._elements.messages.addEventListener('scroll', () => {
        const el = this._elements.messages;
        this._userAtBottom = (el.scrollHeight - el.scrollTop - el.clientHeight) < 16;
      });
    },

    _bindEvents() {
      this._elements.bubble.addEventListener('click', () => this._toggleWidget());

      this._elements.input.addEventListener('input', () => {
        this._elements.input.style.height = 'auto';
        this._elements.input.style.height = this._elements.input.scrollHeight + 'px';
      });

      this._elements.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          if (e.ctrlKey || e.shiftKey) return; else { e.preventDefault(); this._handleSendMessage(); }
        }
      });

      this._elements.form.addEventListener('submit', (e) => { e.preventDefault(); this._handleSendMessage(); });
      this._elements.minimizeBtn.addEventListener('click', () => this._toggleWidget());
      this._elements.closeBtn.addEventListener('click', () => this._resetChat());

      // click outside to close (mobile-friendly)
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this._isOpen) this._toggleWidget(); });
    },

    _handleSendMessage() {
      const text = this._elements.input.value.trim();
      if (!text) return;
      this._removeSuggestionButtons();
      this._addMessage('user', text);
      this._elements.input.value = '';
      this._elements.input.style.height = 'auto';
      this._elements.input.style.height = '24px';
      this._elements.input.focus();

      this._callbacks.messageSent.forEach(cb => { try { cb(text); } catch (e) { log('onMessageSent cb error', e); } });

      if (typeof this._onUserRequest === 'function') {
        this._onUserRequest(text);
      } else {
        this._sendToApi(text);
      }
    },

    _toggleWidget() {
      this._isOpen = !this._isOpen;
      if (this._isOpen && !this._hasOpenedChat) this._hasOpenedChat = true, this._removeWelcomePopup();
      if (this._isOpen) {
        this._elements.widget.classList.add('open');
        setTimeout(() => this._elements.input.focus(), 250);
        this._unread = 0; this._updateUnread();
        this._callbacks.open.forEach(cb => { try { cb(); } catch(e){ log('open cb error', e); } });
      } else {
        this._elements.widget.classList.remove('open');
        this._callbacks.close.forEach(cb => { try { cb(); } catch(e){ log('close cb error', e); } });
      }
      log('Widget toggled:', this._isOpen);
    },

    _resetChat() {
      this._elements.messages.innerHTML = '';
      this._config.sessionId = 'fcw-' + Math.random().toString(36).slice(2) + Date.now();
      this._isOpen = false; this._elements.widget.classList.remove('open');
      if (this._config.welcomeMessage) { this._addMessage('bot', this._config.welcomeMessage); this._createSuggestionButtons(); }
      log('Chat reset with new sessionId:', this._config.sessionId);
    },

    _createWelcomePopup() {
      if (this._hasOpenedChat) return;
      setTimeout(() => {
        if (this._hasOpenedChat || this._isOpen) return;
        const popup = document.createElement('div');
        popup.className = 'fcw-welcome-popup';
        popup.innerHTML = `<div>${this._config.welcomeMessage}<div style="text-align:right;margin-top:6px"><button class=\"fcw-welcome-close\" style=\"background:transparent;border:none;color:#fff;font-weight:700;cursor:pointer\">×</button></div></div>`;
        document.body.appendChild(popup);
        popup.querySelector('.fcw-welcome-close').addEventListener('click', () => this._removeWelcomePopup());
        setTimeout(() => popup.classList.add('show'), 120);
        this._welcomePopup = popup;
      }, 3000);
    },

    _removeWelcomePopup() { if (this._welcomePopup) { this._welcomePopup.remove(); this._welcomePopup = null; } },

    _formatMarkdown(text) {
      let html = text.replace(/\n/g, '<br>').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
        .replace(/(^|[^\">])(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>')
        .replace(/\- (.+)/g, '<li>$1</li>');
      if (/<li>/.test(html)) html = '<ul>' + html + '</ul>';
      return html;
    },

    _addMessage(sender, text, options = {}) {
      const msg = document.createElement('div');
      msg.className = `fcw-message ${sender}`;

      const bubble = document.createElement('div');
      bubble.className = 'fcw-bubble-text';

      if (options.loading) {
        bubble.innerHTML = '<div class="fcw-loading"><span></span><span></span><span></span></div>';
      } else if (options.streaming) {
        bubble.innerHTML = '';
        msg.appendChild(bubble);
        this._elements.messages.appendChild(msg);
        this._maybeAutoScroll();
        this._streamTextToBubble(bubble, text);
        this._callbacks.messageReceived.forEach(cb => { try { cb(text); } catch(e){ log('onMessageReceived cb error', e); } });
        return msg;
      } else {
        bubble.innerHTML = this._formatMarkdown(text);
      }

      msg.appendChild(bubble);
      this._elements.messages.appendChild(msg);
      this._maybeAutoScroll();

      if (!this._isOpen) { this._unread++; this._updateUnread(); }

      this._callbacks.messageReceived.forEach(cb => { try { cb(text); } catch(e){ log('onMessageReceived cb error', e); } });

      log('Message added:', sender, text);
      return msg;
    },

    _streamTextToBubble(bubble, text) {
      let i = 0; const formatted = this._formatMarkdown(text);
      const temp = document.createElement('div'); temp.innerHTML = formatted; const plain = temp.textContent || temp.innerText || '';
      const that = this;
      (function type(){ if (i<=plain.length){ bubble.textContent = plain.slice(0,i); i++; setTimeout(type, 14); } else { bubble.innerHTML = formatted; that._maybeAutoScroll(); } })();
    },

    _maybeAutoScroll() {
      const el = this._elements.messages;
      if (this._userAtBottom) { el.scrollTop = el.scrollHeight; }
    },

    _createSuggestionButtons() {
      if (!this._config._suggestions || !this._config._suggestions.length) return;
      const suggestionsDiv = document.createElement('div');
      suggestionsDiv.className = 'fcw-suggestions';
      suggestionsDiv.id = 'fcw-suggestions';
      this._config._suggestions.forEach(s => {
        const btn = document.createElement('button'); btn.className = 'fcw-suggestion-btn'; btn.type='button'; btn.textContent = s.text;
        btn.addEventListener('click', () => { this._addMessage('user', s.message); this._removeSuggestionButtons(); this._sendToApi(s.message); });
        suggestionsDiv.appendChild(btn);
      });
      this._elements.messages.appendChild(suggestionsDiv);
      this._maybeAutoScroll();
    },

    _removeSuggestionButtons() { const el = document.getElementById('fcw-suggestions'); if (el) el.remove(); },

    _updateUnread() { if (!this._elements.unread) return; if (this._unread>0){ this._elements.unread.style.display='block'; this._elements.unread.textContent = this._unread>99?'99+':String(this._unread); } else this._elements.unread.style.display='none'; },

    _sendToApi(text) {
      // show loading
      this._addMessage('bot', '', { loading: true });
      const payload = { chatInput: text, sessionId: this._config.sessionId, lang: this._config.lang };
      fetch(this._config.apiUrl, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) })
        .then(res => res.json())
        .then(data => {
          // remove loading
          const messages = this._elements.messages;
          if (messages.lastChild && messages.lastChild.querySelector && messages.lastChild.querySelector('.fcw-loading')) messages.removeChild(messages.lastChild);
          let reply = '';
          if (data && data.reply) reply = data.reply; else if (data && data.output) reply = data.output; else if (typeof data === 'string') reply = data;
          if (reply) { this._addMessage('bot', reply, { streaming: true }); }
          else { log('API raw response:', data); this._addMessage('bot', 'Désolé, je n’ai pas compris.'); }
        })
        .catch(err => { const messages = this._elements.messages; if (messages.lastChild && messages.lastChild.querySelector && messages.lastChild.querySelector('.fcw-loading')) messages.removeChild(messages.lastChild); log('API error:', err); this._addMessage('bot', 'Erreur de connexion.'); });
    }
  };

  window.FloatingChatWidget = FloatingChatWidget;
})(window, document);

/* -------------------- MINIFIED (single-line, ready-to-integrate) -------------------- */

/* Minified below for production use (copy the block starting from /*!MINIFIED-WISEBOT*/ ) */

/*!MINIFIED-WISEBOT*/(function(w,d){'use strict';var C={apiUrl:'https://primary-production-33255.up.railway.app/webhook/3b85a429-6ab2-42ec-a6be-98528860366b/chat',position:'bottom-right',theme:'dark',customColors:{},bubbleIcon:'<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path fill="currentColor" d="M12 3C7 3 3.5 6.5 3.5 10.6c0 2.3 1 4.4 2.7 5.9V21l3.4-1.9c.9.2 1.9.3 2.9.3 5 0 8.5-3.5 8.5-7.6S17 3 12 3z"></path></svg>',title:'WiseBot',placeholder:'',welcomeMessage:'',zIndex:9999,width:370,height:580,fontFamily:'inherit',debug:false,sessionId:void 0,lang:'auto',fallbackLang:'fr',translations:{fr:{placeholder:'Écrivez votre message...',welcomeMessage:'Bienvenue ! <br> Je suis WiseBot, l’assistant virtuel. Comment puis-je vous aider aujourd’hui ?',suggestions:[{text:'À propos de W.I.S.E.',message:"J’aimerais avoir des informations sur votre entreprise."},{text:'Qu’est-ce que WiseBot ?',message:"Qu'est-ce que WiseBot ?"},{text:'Nos services',message:"Quels sont vos services ?"}],onlineText:'En ligne'},en:{placeholder:'Type your message...',welcomeMessage:'Welcome! <br> I am WiseBot, your virtual assistant. How can I help you today?',suggestions:[{text:'About W.I.S.E.',message:'I would like information about your company.'},{text:'About WiseBot',message:'What is WiseBot?'},{text:'Our services',message:'What services do you offer?'}],onlineText:'Online'}}};function L(){if(FloatingChatWidget._config&&FloatingChatWidget._config.debug)console.log.apply(console,['[FloatingChatWidget]'].concat(Array.prototype.slice.call(arguments)))}var FloatingChatWidget={_config:{},_elements:{},_isOpen:!1,_unread:0,_onUserRequest:null,_callbacks:{open:[],close:[],messageSent:[],messageReceived:[]},_hasOpenedChat:!1,init:function(cfg){this._config=Object.assign({},C,cfg),this._config.sessionId||(this._config.sessionId='fcw-'+Math.random().toString(36).slice(2)+Date.now());var rl=this._resolveLanguage(this._config.lang);this._config.lang=rl;var t=this._config.translations[rl]||this._config.translations[this._config.fallbackLang];this._config.placeholder=this._config.placeholder||t.placeholder,this._config.welcomeMessage=this._config.welcomeMessage||t.welcomeMessage,this._config._suggestions=t.suggestions||[],this._config.onlineText=t.onlineText||'Online',L('Initializing with config:',this._config),this._createStyles(),this._createWidget(),this._bindEvents(),this._createWelcomePopup(),this._config.welcomeMessage&&(this._addMessage('bot',this._config.welcomeMessage),this._createSuggestionButtons())},onOpen:function(fn){'function'==typeof fn&&this._callbacks.open.push(fn)},onClose:function(fn){'function'==typeof fn&&this._callbacks.close.push(fn)},onMessageSent:function(fn){'function'==typeof fn&&this._callbacks.messageSent.push(fn)},onMessageReceived:function(fn){'function'==typeof fn&&this._callbacks.messageReceived.push(fn)},onUserRequest:function(cb){this._onUserRequest=cb},reply:function(t){this._addMessage('bot',t)},_resolveLanguage:function(pref){if(pref&&'auto'!==pref)return pref;var nav=(navigator.language||navigator.userLanguage||'').toLowerCase(),short=nav.split('-')[0];return short&&this._hasTranslation(short)?short:nav&&this._hasTranslation(nav)?nav:C.fallbackLang},_hasTranslation:function(c){return Boolean(this._config.translations&&this._config.translations[c])},_createStyles:function(){if(d.getElementById('fcw-style'))return;var s=d.createElement('style');s.id='fcw-style';var v={"--fcw-width":this._config.width+'px','--fcw-height':this._config.height+'px','--fcw-radius':'16px','--fcw-primary':this._config.theme==='light'?'#1aa6ff':'#70c7ff','--fcw-bg':this._config.theme==='light'?'#ffffff':'#1f1f1f','--fcw-foreground':this._config.theme==='light'?'#111827':'#f8fafc','--fcw-muted':'#666666'};if(this._config.theme==='custom'&&typeof this._config.customColors==='object')for(var k in this._config.customColors)v['--'+k]=this._config.customColors[k];var vs=':root {';for(var n in v)vs+=n+': '+v[n]+';';vs+='}';s.textContent=vs+"\n.fcw-bubble{position:fixed;"+(this._config.position==='bottom-left'?'left:24px;':'right:24px;')+"bottom:24px;z-index:"+this._config.zIndex+";width:56px;height:56px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.6rem;box-shadow:0 6px 20px rgba(0,0,0,0.15);cursor:pointer;transition:transform .18s,box-shadow .18s}\n.fcw-bubble:hover{transform:scale(1.06);box-shadow:0 10px 30px rgba(0,0,0,0.2)}\n.fcw-unread{position:absolute;top:-6px;right:-6px;background:var(--fcw-primary);color:#fff;border-radius:12px;padding:2px 6px;font-size:0.7rem;min-width:20px;text-align:center}\n.fcw-widget{position:fixed;"+(this._config.position==='bottom-left'?'left:24px;':'right:24px;')+"bottom:90px;z-index:"+this._config.zIndex+";width:var(--fcw-width);max-width:95vw;height:var(--fcw-height);max-height:80vh;background:var(--fcw-bg);border-radius:var(--fcw-radius);box-shadow:0 12px 40px rgba(0,0,0,0.25);display:flex;flex-direction:column;overflow:hidden;opacity:0;pointer-events:none;transform:translateY(20px) scale(.98);transition:opacity .28s,transform .28s}.fcw-widget.open{opacity:1;pointer-events:auto;transform:translateY(0) scale(1)}\n.fcw-header{background:linear-gradient(90deg,var(--fcw-primary),#3fb0ff);padding:12px 14px;color:#fff;display:flex;align-items:center;justify-content:space-between}\n.fcw-header-left{display:flex;align-items:center;gap:10px}\n.fcw-avatar{width:40px;height:40px;border-radius:50%;background:#fff;flex-shrink:0}\n.fcw-header-title{font-weight:700;font-size:1rem}\n.fcw-header-info{display:flex;flex-direction:column}\n.fcw-status{font-size:0.8rem;color:rgba(255,255,255,0.9)}\n.fcw-messages{flex:1;padding:14px;overflow:auto;background:transparent;color:var(--fcw-foreground);font-family:"+this._config.fontFamily+"}\n.fcw-message{margin-bottom:12px;display:flex;align-items:flex-end}\n.fcw-message.user{justify-content:flex-end}\n.fcw-message.bot{justify-content:flex-start}\n.fcw-message .fcw-bubble-text{border-radius:12px;padding:10px 14px;max-width:80%;font-size:0.96rem;box-shadow:0 4px 18px rgba(0,0,0,0.08)}\n.fcw-message.user .fcw-bubble-text{background:var(--fcw-primary);color:#000}\n.fcw-message.bot .fcw-bubble-text{background:rgba(255,255,255,0.06);color:var(--fcw-foreground)}\n.fcw-input-row{display:flex;align-items:center;padding:8px;border-top:1px solid rgba(255,255,255,0.04);background:transparent}\n.fcw-input{flex:1;border:none;padding:10px;border-radius:10px;font-size:1rem;resize:none;background:rgba(255,255,255,0.02);color:var(--fcw-foreground);outline:none}\n.fcw-send-btn{background:none;border:none;color:var(--fcw-primary);font-size:1.2rem;padding:8px;cursor:pointer}\n.fcw-loading{display:inline-flex;align-items:center;gap:6px;color:var(--fcw-muted)}\n.fcw-loading span{display:inline-block;width:6px;height:6px;border-radius:50%;background:currentColor;animation:fcw-wave 1.2s linear infinite}\n@keyframes fcw-wave{0%{opacity:.3;transform:translateY(0)}50%{opacity:1;transform:translateY(-6px)}100%{opacity:.3;transform:translateY(0)}}\n.fcw-suggestions{padding:12px;display:flex;flex-wrap:wrap;gap:8px}\n.fcw-suggestion-btn{background:transparent;border:1px solid rgba(255,255,255,0.08);padding:8px 10px;border-radius:8px;color:var(--fcw-foreground);cursor:pointer}\n.fcw-welcome-popup{position:fixed;"+(this._config.position==='bottom-left'?'left:90px;':'right:90px;')+"bottom:35px;z-index:"+this._config.zIndex+1+";background:var(--fcw-primary);color:#fff;padding:10px 14px;border-radius:12px;box-shadow:0 6px 30px rgba(0,0,0,0.18);opacity:0;transform:translateY(8px);transition:all .28s}.fcw-welcome-popup.show{opacity:1;transform:translateY(0)}\n";d.head.appendChild(s)},_createWidget:function(){var b=d.createElement('div');b.className='fcw-bubble',b.innerHTML=this._config.bubbleIcon;var u=d.createElement('div');u.className='fcw-unread',u.style.display='none',u.textContent='0',b.appendChild(u),d.body.appendChild(b);var w=d.createElement('div');w.className='fcw-widget',w.innerHTML="\n      <div class=\"fcw-header\">\n        <div class=\"fcw-header-left\">\n          <div class=\"fcw-avatar\" aria-hidden></div>\n          <div class=\"fcw-header-info\">\n            <div class=\"fcw-header-title\">"+this._config.title+"</div>\n            <div class=\"fcw-status\"><span class=\"fcw-status-dot\"></span> "+this._config.onlineText+"</div>\n          </div>\n        </div>\n        <div>\n          <button class=\"fcw-minimize-btn\" aria-label=\"minimize\">−</button>\n          <button class=\"fcw-close-btn\" aria-label=\"close\">✕</button>\n        </div>\n      </div>\n      <div class=\"fcw-messages\" role=\"log\" aria-live=\"polite\"></div>\n      <form class=\"fcw-input-row\" autocomplete=\"off\">\n        <textarea class=\"fcw-input\" placeholder=\""+this._config.placeholder+"\" rows=\"1\"></textarea>\n        <button class=\"fcw-send-btn\" type=\"submit\">➤</button>\n      </form>\n      ",d.body.appendChild(w),this._elements={bubble:b,unread:u,widget:w,messages:w.querySelector('.fcw-messages'),input:w.querySelector('.fcw-input'),form:w.querySelector('.fcw-input-row'),sendBtn:w.querySelector('.fcw-send-btn'),closeBtn:w.querySelector('.fcw-close-btn'),minimizeBtn:w.querySelector('.fcw-minimize-btn')};var el=this._elements.messages;this._userAtBottom=!0,el.addEventListener('scroll',function(){var e=el;FloatingChatWidget._userAtBottom=(e.scrollHeight-e.scrollTop-e.clientHeight)<16})},_bindEvents:function(){var that=this;this._elements.bubble.addEventListener('click',function(){that._toggleWidget()}),this._elements.input.addEventListener('input',function(){that._elements.input.style.height='auto',that._elements.input.style.height=that._elements.input.scrollHeight+'px'}),this._elements.input.addEventListener('keydown',function(e){if(e.key==='Enter'){if(e.ctrlKey||e.shiftKey)return;else{e.preventDefault();that._handleSendMessage()}}}),this._elements.form.addEventListener('submit',function(e){e.preventDefault(),that._handleSendMessage()}),this._elements.minimizeBtn.addEventListener('click',function(){that._toggleWidget()}),this._elements.closeBtn.addEventListener('click',function(){that._resetChat()}),document.addEventListener('keydown',function(e){'Escape'===e.key&&that._isOpen&&that._toggleWidget()})},_handleSendMessage:function(){var text=this._elements.input.value.trim();if(!text)return;this._removeSuggestionButtons(),this._addMessage('user',text),this._elements.input.value='',this._elements.input.style.height='auto',this._elements.input.style.height='24px',this._elements.input.focus(),this._callbacks.messageSent.forEach(function(cb){try{cb(text)}catch(e){L('onMessageSent cb error',e)}}),typeof this._onUserRequest==='function'?this._onUserRequest(text):this._sendToApi(text)},_toggleWidget:function(){this._isOpen=!this._isOpen,this._isOpen&&!this._hasOpenedChat&&(this._hasOpenedChat=!0,this._removeWelcomePopup()),this._isOpen?(this._elements.widget.classList.add('open'),setTimeout(function(){this._elements.input.focus()}.bind(this),250),this._unread=0,this._updateUnread(),this._callbacks.open.forEach(function(cb){try{cb()}catch(e){L('open cb error',e)}})):(this._elements.widget.classList.remove('open'),this._callbacks.close.forEach(function(cb){try{cb()}catch(e){L('close cb error',e)}})),L('Widget toggled:',this._isOpen)},_resetChat:function(){this._elements.messages.innerHTML='',this._config.sessionId='fcw-'+Math.random().toString(36).slice(2)+Date.now(),this._isOpen=!1,this._elements.widget.classList.remove('open'),this._config.welcomeMessage&&(this._addMessage('bot',this._config.welcomeMessage),this._createSuggestionButtons()),L('Chat reset with new sessionId:',this._config.sessionId)},_createWelcomePopup:function(){var that=this;if(this._hasOpenedChat)return;setTimeout(function(){if(that._hasOpenedChat||that._isOpen)return;var popup=d.createElement('div');popup.className='fcw-welcome-popup',popup.innerHTML='<div>'+that._config.welcomeMessage+'<div style="text-align:right;margin-top:6px"><button class="fcw-welcome-close" style="background:transparent;border:none;color:#fff;font-weight:700;cursor:pointer">×</button></div></div>',d.body.appendChild(popup),popup.querySelector('.fcw-welcome-close').addEventListener('click',function(){that._removeWelcomePopup()}),setTimeout(function(){popup.classList.add('show')},120),that._welcomePopup=popup},3e3)},_removeWelcomePopup:function(){this._welcomePopup&&(this._welcomePopup.remove(),this._welcomePopup=null)},_formatMarkdown:function(text){var html=text.replace(/\n/g,'<br>').replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/\*(.+?)\*/g,'<i>$1</i>').replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>').replace(/(^|[^\">])(https?:\/\/[^\s<]+)/g,'$1<a href="$2" target="_blank" rel="noopener">$2</a>').replace(/\- (.+)/g,'<li>$1</li>');return /<li>/.test(html)?'<ul>'+html+'</ul>':html},_addMessage:function(sender,text,options){var msg=d.createElement('div');msg.className='fcw-message '+sender;var bubble=d.createElement('div');bubble.className='fcw-bubble-text';if(options&&options.loading)bubble.innerHTML='<div class="fcw-loading"><span></span><span></span><span></span></div>';else if(options&&options.streaming){bubble.innerHTML='',msg.appendChild(bubble),this._elements.messages.appendChild(msg),this._maybeAutoScroll(),this._streamTextToBubble(bubble,text),this._callbacks.messageReceived.forEach(function(cb){try{cb(text)}catch(e){L('onMessageReceived cb error',e)}});return msg}else bubble.innerHTML=this._formatMarkdown(text);msg.appendChild(bubble),this._elements.messages.appendChild(msg),this._maybeAutoScroll(),this._isOpen||(--this._unread,this._updateUnread()),this._callbacks.messageReceived.forEach(function(cb){try{cb(text)}catch(e){L('onMessageReceived cb error',e)}}),L('Message added:',sender,text);return msg},_streamTextToBubble:function(bubble,text){var i=0,formatted=this._formatMarkdown(text),tmp=d.createElement('div');tmp.innerHTML=formatted;var plain=tmp.textContent||tmp.innerText||'';var that=this;(function type(){if(i<=plain.length){bubble.textContent=plain.slice(0,i),i++,setTimeout(type,14)}else{bubble.innerHTML=formatted,that._maybeAutoScroll()}})()},_maybeAutoScroll:function(){var el=this._elements.messages;this._userAtBottom&&(el.scrollTop=el.scrollHeight)},_createSuggestionButtons:function(){var s=this._config._suggestions;if(!s||!s.length)return;var div=d.createElement('div');div.className='fcw-suggestions',div.id='fcw-suggestions',s.forEach(function(item){var btn=d.createElement('button');btn.className='fcw-suggestion-btn',btn.type='button',btn.textContent=item.text,btn.addEventListener('click',function(){FloatingChatWidget._addMessage('user',item.message),FloatingChatWidget._removeSuggestionButtons(),FloatingChatWidget._sendToApi(item.message)}),div.appendChild(btn)}),this._elements.messages.appendChild(div),this._maybeAutoScroll()},_removeSuggestionButtons:function(){var e=d.getElementById('fcw-suggestions');e&&e.remove()},_updateUnread:function(){if(!this._elements.unread)return;this._unread>0?(this._elements.unread.style.display='block',this._elements.unread.textContent=this._unread>99?'99+':String(this._unread)):this._elements.unread.style.display='none'},_sendToApi:function(text){this._addMessage('bot','',{loading:!0});var payload={chatInput:text,sessionId:this._config.sessionId,lang:this._config.lang};fetch(this._config.apiUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}).then(function(res){return res.json()}).then(function(data){var messages=FloatingChatWidget._elements.messages;messages.lastChild&&messages.lastChild.querySelector&&messages.lastChild.querySelector('.fcw-loading')&&messages.removeChild(messages.lastChild);var reply='';data&&data.reply?reply=data.reply:data&&data.output?reply=data.output:typeof data==='string'&&(reply=data),reply?FloatingChatWidget._addMessage('bot',reply,{streaming:!0}):L('API raw response:',data)&&FloatingChatWidget._addMessage('bot','Désolé, je n’ai pas compris.')}).catch(function(err){var messages=FloatingChatWidget._elements.messages;messages.lastChild&&messages.lastChild.querySelector&&messages.lastChild.querySelector('.fcw-loading')&&messages.removeChild(messages.lastChild),L('API error:',err),FloatingChatWidget._addMessage('bot','Erreur de connexion.')})}};w.FloatingChatWidget=FloatingChatWidget})(window,document);

/* End of file */
