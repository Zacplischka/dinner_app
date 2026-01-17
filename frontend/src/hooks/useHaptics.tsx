// Haptic feedback hook for mobile devices
// Provides native-like tactile feedback on touch interactions

import { ReactNode, useState, useRef, useCallback } from 'react';

type HapticType = 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'warning' | 'error';

// Vibration patterns in milliseconds
const HAPTIC_PATTERNS: Record<HapticType, number | number[]> = {
  light: 10,
  medium: 20,
  heavy: 40,
  selection: 5,
  success: [10, 50, 10],
  warning: [20, 50, 20],
  error: [40, 50, 40, 50, 40],
};

export function useHaptics() {
  // Check if Vibration API is supported
  const isSupported = typeof navigator !== 'undefined' && 'vibrate' in navigator;

  const trigger = (type: HapticType = 'light') => {
    if (!isSupported) return;

    try {
      navigator.vibrate(HAPTIC_PATTERNS[type]);
    } catch {
      // Silently fail if vibration is blocked
    }
  };

  // Convenience methods for common interactions
  const triggerLight = () => trigger('light');
  const triggerMedium = () => trigger('medium');
  const triggerHeavy = () => trigger('heavy');
  const triggerSelection = () => trigger('selection');
  const triggerSuccess = () => trigger('success');
  const triggerWarning = () => trigger('warning');
  const triggerError = () => trigger('error');

  return {
    isSupported,
    trigger,
    triggerLight,
    triggerMedium,
    triggerHeavy,
    triggerSelection,
    triggerSuccess,
    triggerWarning,
    triggerError,
  };
}

// ═══════════════════════════════════════════════════════════════════
// TOUCH FEEDBACK WRAPPER COMPONENT
// Adds visual and haptic feedback to any interactive element
// ═══════════════════════════════════════════════════════════════════

interface TouchFeedbackProps {
  children: ReactNode;
  className?: string;
  hapticType?: HapticType;
  scaleOnPress?: number;
  disabled?: boolean;
  onPress?: () => void;
}

export function TouchFeedback({
  children,
  className = '',
  hapticType = 'light',
  scaleOnPress = 0.98,
  disabled = false,
  onPress,
}: TouchFeedbackProps) {
  const [isPressed, setIsPressed] = useState(false);
  const { trigger } = useHaptics();
  const timeoutRef = useRef<number | null>(null);

  const handleTouchStart = useCallback(() => {
    if (disabled) return;
    setIsPressed(true);
    trigger(hapticType);
  }, [disabled, hapticType, trigger]);

  const handleTouchEnd = useCallback(() => {
    setIsPressed(false);
    // Small delay to allow animation to complete
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      onPress?.();
    }, 50);
  }, [onPress]);

  const handleTouchCancel = useCallback(() => {
    setIsPressed(false);
  }, []);

  return (
    <div
      className={`transition-transform duration-150 ease-out ${className}`}
      style={{
        transform: isPressed ? `scale(${scaleOnPress})` : 'scale(1)',
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      onMouseDown={handleTouchStart}
      onMouseUp={handleTouchEnd}
      onMouseLeave={handleTouchCancel}
    >
      {children}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// RIPPLE EFFECT COMPONENT
// Material Design-style ripple on touch
// ═══════════════════════════════════════════════════════════════════

interface RippleProps {
  x: number;
  y: number;
  size: number;
}

interface RippleButtonProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
  rippleColor?: string;
}

export function RippleButton({
  children,
  className = '',
  onClick,
  disabled = false,
  rippleColor = 'rgba(212, 165, 116, 0.3)', // amber with opacity
}: RippleButtonProps) {
  const [ripples, setRipples] = useState<RippleProps[]>([]);
  const { triggerLight } = useHaptics();

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (disabled) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;

    const newRipple = { x, y, size };
    setRipples((prev) => [...prev, newRipple]);

    triggerLight();
    onClick?.();

    // Clean up ripple after animation
    setTimeout(() => {
      setRipples((prev) => prev.slice(1));
    }, 600);
  };

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      onClick={handleClick}
      style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
    >
      {children}
      {ripples.map((ripple, index) => (
        <span
          key={index}
          className="absolute rounded-full animate-ripple pointer-events-none"
          style={{
            left: ripple.x,
            top: ripple.y,
            width: ripple.size,
            height: ripple.size,
            backgroundColor: rippleColor,
          }}
        />
      ))}
    </div>
  );
}
