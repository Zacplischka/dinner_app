import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useFriendsStore } from '../stores/friendsStore';
import ProfileAvatar from '../components/ProfileAvatar';
import GoogleSignInButton from '../components/GoogleSignInButton';

export default function ProfilePage() {
  const { user, isLoading } = useAuthStore();
  const {
    currentUserProfile,
    isLoadingProfile,
    isSavingPhoto,
    profileError,
    fetchCurrentProfile,
    saveProfilePhoto,
  } = useFriendsStore();
  const profile = currentUserProfile?.id === user?.id ? currentUserProfile : null;
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [notice, setNotice] = useState('');
  const userId = user?.id;
  useEffect(() => {
    if (userId) void fetchCurrentProfile();
  }, [userId, fetchCurrentProfile]);
  useEffect(() => {
    setFile(null);
    setNotice('');
  }, [user?.id]);
  const save = async (selected: File | null) => {
    setNotice('');
    if (await saveProfilePhoto(selected)) {
      setFile(null);
      setNotice(selected ? 'Photo saved.' : 'Photo removed.');
    }
  };
  return (
    <main className="mx-auto min-h-screen w-full max-w-lg px-4 py-6 text-text">
      <Link to="/" className="inline-flex min-h-[48px] items-center text-cyan">
        ← Home
      </Link>
      <h1 className="mt-3 text-3xl font-bold">Profile settings</h1>
      {isLoading ? (
        <p role="status" className="mt-6">
          Loading your account…
        </p>
      ) : !user ? (
        <div className="mt-6 space-y-4">
          <p>Sign in to save a profile photo. You can still join any session as a guest.</p>
          <GoogleSignInButton />
        </div>
      ) : (
        <section
          aria-label="Profile photo"
          className="mt-6 space-y-5 rounded-2xl border border-line bg-surface p-5"
        >
          <div className="flex items-center gap-4">
            <ProfileAvatar
              name={profile?.displayName ?? 'Your profile'}
              url={profile?.avatarUrl}
              label="Saved profile photo"
              className="h-24 w-24 ring-2 ring-cyan text-3xl"
            />
            <p className="min-w-0 break-words font-semibold">
              {profile?.displayName ?? 'Your profile'}
            </p>
          </div>
          <p className="text-sm text-muted">
            Your photo appears to friends and people in your sessions. Changes apply when you next
            join or rejoin a session.
          </p>
          <p id="photo-help" className="text-sm text-muted">
            JPEG, PNG or WebP, up to 5 MB and 4096 × 4096 pixels. Photos are cropped to a centred
            square and shown in a circle.
          </p>
          <input
            ref={input}
            id="profile-photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Choose profile photo"
            aria-describedby="photo-help"
            className="sr-only"
            tabIndex={-1}
            disabled={isSavingPhoto || !profile}
            onChange={(event) => {
              const selected = event.target.files?.[0];
              if (selected) {
                setFile(selected);
                setNotice('');
              }
              event.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={isSavingPhoto || !profile}
            className="btn btn-secondary min-h-[48px] w-full"
          >
            {profile?.avatarUrl ? 'Change photo' : 'Add photo'}
          </button>
          {file && (
            <div className="space-y-3">
              <p className="break-all text-sm">Selected: {file.name}</p>
              <button
                onClick={() => void save(file)}
                disabled={isSavingPhoto}
                className="btn btn-primary min-h-[48px] w-full"
              >
                {isSavingPhoto ? 'Saving…' : 'Save photo'}
              </button>
              <button
                onClick={() => setFile(null)}
                disabled={isSavingPhoto}
                className="btn btn-secondary min-h-[48px] w-full"
              >
                Cancel selection
              </button>
            </div>
          )}
          {profile?.avatarUrl && (
            <button
              onClick={() => void save(null)}
              disabled={isSavingPhoto}
              className="btn btn-secondary min-h-[48px] w-full"
            >
              Remove photo
            </button>
          )}
          <p role="status" aria-live="polite">
            {isSavingPhoto
              ? 'Saving your photo…'
              : isLoadingProfile
                ? 'Loading your profile…'
                : notice}
          </p>
          {profileError && (
            <div role="alert" className="space-y-3 text-coral-soft">
              <p>{profileError}</p>
              {!profile && (
                <button
                  onClick={() => void fetchCurrentProfile()}
                  disabled={isLoadingProfile}
                  className="btn btn-secondary min-h-[48px] w-full"
                >
                  Retry loading profile
                </button>
              )}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
