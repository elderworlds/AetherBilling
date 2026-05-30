type Props = {
  visible: boolean;
};

export function TestModeBanner({ visible }: Props) {
  if (!visible) return null;
  return <div className="test-mode-banner">TEST MODE</div>;
}
