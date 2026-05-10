import * as React from "react";

export type LogoItem =
  | {
      node: React.ReactNode;
      title?: string;
      href?: string;
      ariaLabel?: string;
    }
  | {
      src: string;
      srcSet?: string;
      sizes?: string;
      width?: number;
      height?: number;
      alt?: string;
      title?: string;
      href?: string;
    };

export interface LogoLoopProps {
  logos: LogoItem[];
  speed?: number;
  direction?: "left" | "right" | "up" | "down";
  width?: number | string;
  logoHeight?: number;
  gap?: number;
  pauseOnHover?: boolean;
  hoverSpeed?: number;
  fadeOut?: boolean;
  fadeOutColor?: string;
  scaleOnHover?: boolean;
  renderItem?: (item: LogoItem, key: React.Key) => React.ReactNode;
  ariaLabel?: string;
  className?: string;
  style?: React.CSSProperties;
}

declare const LogoLoop: React.MemoExoticComponent<
  (props: LogoLoopProps) => React.ReactElement
>;

export { LogoLoop };
export default LogoLoop;
