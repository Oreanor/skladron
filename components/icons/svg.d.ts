/** .svg приходят компонентами: их разворачивает svgr, см. next.config.ts. */
declare module "*.svg" {
  import type { FC, SVGProps } from "react";
  const Icon: FC<SVGProps<SVGSVGElement>>;
  export default Icon;
}
