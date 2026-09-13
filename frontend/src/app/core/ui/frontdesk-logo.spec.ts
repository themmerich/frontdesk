import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { FrontdeskLogo } from './frontdesk-logo';

describe('FrontdeskLogo', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FrontdeskLogo],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  function render(inputs: { wordmark?: boolean; onPrimary?: boolean } = {}): SVGSVGElement {
    const fixture = TestBed.createComponent(FrontdeskLogo);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector('svg')!;
  }

  it('is one image that says the name, with the mark in the primary colour and the word in the text colour', () => {
    const svg = render();

    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('frontdesk');
    expect(svg.querySelector('rect')?.getAttribute('fill')).toBe('var(--p-primary-color)');
    expect(svg.querySelector('text')?.getAttribute('fill')).toBe('currentColor');
    expect(svg.querySelector('text')?.textContent?.trim()).toBe('frontdesk');
  });

  it('stands as the mark alone without the word, still saying the name', () => {
    const svg = render({ wordmark: false });

    expect(svg.querySelector('text')).toBeNull();
    expect(svg.getAttribute('viewBox')).toBe('0 0 40 40');
    expect(svg.getAttribute('aria-label')).toBe('frontdesk');
  });

  it('swaps its colours on a primary surface', () => {
    const svg = render({ onPrimary: true });

    expect(svg.querySelector('rect')?.getAttribute('fill')).toBe('var(--p-primary-contrast-color)');
    expect(svg.querySelector('g')?.getAttribute('stroke')).toBe('var(--p-primary-color)');
  });
});
