// Site behaviour: menu, 3D hero, FAQ, booking embed, contact form, phone action bar, reveals.
import { mountAll } from './hero3d.js';

document.documentElement.classList.add('js');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

// ---- 3D hero ------------------------------------------------------------------
mountAll();

// ---- phone menu -----------------------------------------------------------------
const nav = document.querySelector('.nav');
const menuBtn = nav.querySelector('.menu-btn');
const setMenu = (open) => {
  nav.classList.toggle('is-open', open);
  menuBtn.setAttribute('aria-expanded', String(open));
  menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
};
menuBtn.addEventListener('click', () => setMenu(menuBtn.getAttribute('aria-expanded') !== 'true'));
nav.querySelectorAll('.nav-links a').forEach((a) => a.addEventListener('click', () => setMenu(false)));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });
document.addEventListener('click', (e) => { if (!nav.contains(e.target)) setMenu(false); });

// ---- highlight the section in view -----------------------------------------------
const links = new Map([...document.querySelectorAll('.nav-links a')].map((a) => [a.hash.slice(1), a]));
const spy = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) {
    links.forEach((a) => a.removeAttribute('aria-current'));
    links.get(e.target.id)?.setAttribute('aria-current', 'true');
  }
}, { rootMargin: '-45% 0px -50% 0px' });
links.forEach((_, id) => { const s = document.getElementById(id); if (s) spy.observe(s); });

// ---- FAQ: animate height, interruptible (starts from the current height) ------------
document.querySelectorAll('.faq details').forEach((d) => {
  const summary = d.querySelector('summary');
  const body = d.querySelector('.answer');
  let anim = null;
  summary.addEventListener('click', (e) => {
    if (reduced.matches) return;               // native instant toggle
    e.preventDefault();
    const opening = !d.open || d.dataset.closing === '1';
    const from = body.getBoundingClientRect().height;
    anim?.cancel();
    if (opening) { d.open = true; delete d.dataset.closing; }
    const to = opening ? body.scrollHeight : 0;
    if (!opening) d.dataset.closing = '1';
    anim = body.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: 380, easing: EASE });
    anim.onfinish = () => { anim = null; if (!opening) { d.open = false; delete d.dataset.closing; } };
  });
});

// ---- booking: load the Cal.com embed only when the section is near ------------------
const calEl = document.getElementById('cal-30min');
if (calEl) {
  const io = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    io.disconnect();
    (function (C, A, L) { const p = function (a, ar) { a.q.push(ar); }; const d = C.document; C.Cal = C.Cal || function () { const cal = C.Cal; const ar = arguments; if (!cal.loaded) { cal.ns = {}; cal.q = cal.q || []; d.head.appendChild(d.createElement('script')).src = A; cal.loaded = true; } if (ar[0] === L) { const api = function () { p(api, arguments); }; const namespace = ar[1]; api.q = api.q || []; if (typeof namespace === 'string') { cal.ns[namespace] = cal.ns[namespace] || api; p(cal.ns[namespace], ar); p(cal, ['initNamespace', namespace]); } else p(cal, ar); return; } p(cal, ar); }; })(window, 'https://app.cal.com/embed/embed.js', 'init');
    Cal('init', '30min', { origin: 'https://app.cal.com' });
    calEl.innerHTML = '';
    Cal.ns['30min']('inline', { elementOrSelector: '#cal-30min', calLink: 'additivcorp/30min', config: { layout: 'month_view', theme: 'light' } });
    Cal.ns['30min']('ui', { hideEventTypeDetails: true, layout: 'month_view', cssVarsPerTheme: { light: { 'cal-brand': '#1f2430' } } });
  }, { rootMargin: '600px' });
  io.observe(calEl);
}

// ---- contact form: validate inline, then hand off to the visitor's email app ----------
const form = document.getElementById('contact-form');
if (form) {
  const error = form.querySelector('.form-error');
  const check = (field) => {
    const ok = field.value.trim() !== '' && field.checkValidity();
    field.setAttribute('aria-invalid', String(!ok));
    return ok;
  };
  form.querySelectorAll('input, textarea').forEach((f) => f.addEventListener('blur', () => { if (f.value) check(f); }));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fields = [...form.querySelectorAll('input, textarea')];
    const bad = fields.filter((f) => !check(f));
    if (bad.length) {
      error.textContent = bad[0].name === 'email' && bad[0].value ? 'Please enter a valid email address.' : 'Please fill in your name, email and message.';
      error.hidden = false; bad[0].focus(); return;
    }
    error.hidden = true;
    const { name, email, message } = Object.fromEntries(new FormData(form));
    const subject = `Enquiry from ${name}`;
    const body = `${message}\n\n— ${name}\n${email}`;
    location.href = `mailto:hello@additivcorp.co.in?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  });
}

// ---- phone action bar: appears once the hero buttons scroll away ---------------------
const bar = document.querySelector('.action-bar');
const heroActions = document.getElementById('hero-actions');
const contact = document.getElementById('contact');
if (bar && heroActions) {
  let heroGone = false, atContact = false;
  const update = () => {
    const show = heroGone && !atContact;
    bar.classList.toggle('is-shown', show);
    bar.setAttribute('aria-hidden', String(!show));
    bar.querySelector('a').tabIndex = show ? 0 : -1;
  };
  new IntersectionObserver(([e]) => { heroGone = !e.isIntersecting && e.boundingClientRect.top < 0; update(); }).observe(heroActions);
  new IntersectionObserver(([e]) => { atContact = e.isIntersecting; update(); }, { rootMargin: '0px 0px -30% 0px' }).observe(contact);
}

// ---- gentle reveal of cards as they enter ------------------------------------------
const revealables = document.querySelectorAll('.heading, .step, .service, .product, .gallery figure, .protocol, .faq, .booking, .contact-form');
const rv = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); rv.unobserve(e.target); }
}, { rootMargin: '0px 0px -8% 0px' });
revealables.forEach((el, i) => {
  el.classList.add('reveal');
  // stagger siblings in the same row a little
  const idx = [...el.parentElement.children].indexOf(el);
  el.style.transitionDelay = `${Math.min(idx, 3) * 60}ms`;
  rv.observe(el);
});
