/** Pulsing rings around tokens, seen only by this client, e.g. the tokens a choice applies to. */
export interface TokenHighlight {
  /** Pulse this token's ring brighter (the one being acted on); none when omitted. */
  setActive(token?: Token.Implementation): void;
  remove(): void;
}

export interface TokenHighlightOptions {
  /** Ring colour, default the user's colour. */
  color?: number;
}

export function highlightTokens(tokens: Iterable<Token.Implementation>, { color }: TokenHighlightOptions = {}): TokenHighlight {
  const ringed = new Set(tokens);
  const ringColor = color ?? Number(game.user?.color ?? 0xff9829);
  const graphics = new PIXI.Graphics();
  graphics.eventMode = "none";
  canvas?.controls?.addChild(graphics);
  let active: Token.Implementation | undefined;

  const draw = () => {
    if (graphics.destroyed) return;
    graphics.clear();
    const phase = performance.now() / 1000;
    for (const token of ringed) {
      if (token.destroyed || !token.visible) continue;
      const isActive = token === active;
      const pulse = (Math.sin(phase * (isActive ? 6 : 3)) + 1) / 2;
      const { x, y } = token.center;
      const radius = Math.max(token.w, token.h) / 2 + (isActive ? 8 : 4) + pulse * 4;
      graphics.lineStyle(isActive ? 6 : 3, ringColor, isActive ? 0.6 + pulse * 0.4 : 0.3 + pulse * 0.4);
      graphics.drawCircle(x, y, radius);
    }
  };
  canvas?.app?.ticker.add(draw);

  const remove = () => {
    canvas?.app?.ticker.remove(draw);
    Hooks.off("canvasTearDown", hookId);
    if (!graphics.destroyed) graphics.destroy();
  };
  const hookId = Hooks.once("canvasTearDown", remove);

  return {
    setActive: (token) => { active = token; },
    remove
  };
}
