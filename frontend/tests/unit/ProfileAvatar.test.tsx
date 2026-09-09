import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ProfileAvatar from '../../src/components/ProfileAvatar';
import { API_BASE_URL } from '../../src/services/apiClient';

describe('ProfileAvatar', () => {
  it('resolves API images on split origins and falls back without changing size after a failed image', () => {
    const path = '/api/profile-photos/profile/version.jpg';
    const { rerender } = render(<ProfileAvatar name="Alice" url={path} className="h-8 w-8" />);
    const avatar = screen.getByRole('img', { name: 'Alice' });
    const image = avatar.querySelector('img')!;
    expect(image.src).toBe(new URL(path, new URL(API_BASE_URL, window.location.origin)).href);
    fireEvent.error(image);
    expect(avatar.querySelector('img')).toBeNull();
    expect(avatar).toHaveTextContent('A');
    expect(avatar).toHaveClass('h-8', 'w-8', 'overflow-hidden');
    rerender(<ProfileAvatar name="Alice" url="https://example.test/new.jpg" className="h-8 w-8" />);
    expect(avatar.querySelector('img')).toHaveAttribute('src', 'https://example.test/new.jpg');
    rerender(<ProfileAvatar name="Guest" url={null} className="h-8 w-8" />);
    expect(screen.getByRole('img', { name: 'Guest' })).toHaveTextContent('G');
  });
});
