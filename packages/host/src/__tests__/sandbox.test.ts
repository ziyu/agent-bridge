// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IframeSandbox } from '../sandbox/iframe.js';
import { InlineSandbox } from '../sandbox/inline.js';

describe('IframeSandbox', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('creates iframe with correct src and no sandbox by default', () => {
    const sandbox = new IframeSandbox();
    const connId = 'test-conn-123';
    const iframe = sandbox.mount(
      { type: 'uri', url: 'https://example.com/app' },
      { container },
      connId,
    );

    expect(iframe.tagName).toBe('IFRAME');
    expect(iframe.src).toBe('https://example.com/app#__bridge_channel__=test-conn-123');
    expect(iframe.getAttribute('sandbox')).toBeNull();
    expect(container.contains(iframe)).toBe(true);
  });

  it('applies custom sandbox and permissions', () => {
    const sandbox = new IframeSandbox();
    const iframe = sandbox.mount(
      { type: 'uri', url: 'https://example.com' },
      { container, sandbox: 'allow-scripts', permissions: ['camera', 'microphone'] },
      'conn-2',
    );

    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts');
    expect(iframe.allow).toBe('camera; microphone');
  });

  it('unmounts and cleans up', () => {
    const sandbox = new IframeSandbox();
    sandbox.mount({ type: 'uri', url: 'https://example.com' }, { container }, 'conn-3');
    expect(container.children.length).toBe(1);

    sandbox.unmount();
    expect(container.children.length).toBe(0);
    expect(sandbox.getContentWindow()).toBeNull();
  });

  it('registers crash handler', () => {
    const sandbox = new IframeSandbox();
    const handler = vi.fn();
    sandbox.mount({ type: 'uri', url: 'https://example.com' }, { container }, 'conn-4');
    const unsub = sandbox.onCrash(handler);

    expect(typeof unsub).toBe('function');
    unsub();
  });
});

describe('InlineSandbox', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('creates iframe with srcdoc for HTML code', () => {
    const sandbox = new InlineSandbox();
    const iframe = sandbox.mount(
      { type: 'raw', code: '<div>Hello</div>', codeType: 'html' },
      { container },
      'conn-5',
    );

    expect(iframe.tagName).toBe('IFRAME');
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts');
    expect(iframe.srcdoc).toContain('<div>Hello</div>');
    expect(iframe.srcdoc).toContain('<!DOCTYPE html>');
  });

  it('wraps JS code in HTML document', () => {
    const sandbox = new InlineSandbox();
    const iframe = sandbox.mount(
      { type: 'raw', code: 'console.log("hi")', codeType: 'js' },
      { container },
      'conn-6',
    );

    expect(iframe.srcdoc).toContain('<script>console.log("hi")</script>');
    expect(iframe.srcdoc).toContain('<!DOCTYPE html>');
  });

  it('injects SDK before </head> when present', () => {
    const sandbox = new InlineSandbox();
    const html = '<!DOCTYPE html><html><head><title>Test</title></head><body></body></html>';
    const iframe = sandbox.mount(
      { type: 'raw', code: html, codeType: 'html' },
      { container },
      'conn-7',
    );

    expect(iframe.srcdoc).toContain('</head>');
    expect(iframe.srcdoc).toContain('<title>Test</title>');
  });

  it('unmounts and cleans up', () => {
    const sandbox = new InlineSandbox();
    sandbox.mount({ type: 'raw', code: '<p>test</p>' }, { container }, 'conn-8');
    expect(container.children.length).toBe(1);

    sandbox.unmount();
    expect(container.children.length).toBe(0);
  });
});
