"use client";

import { Children, cloneElement, isValidElement, useContext, useMemo, type ComponentProps, type MouseEvent, type ReactElement, type ReactNode } from "react";
import { MarkdownRenderer, type CodeRenderers, type LinkPolicy, type MarkdownComponents } from "@gigachad/chat-ui";
import type { MarkdownBody } from "@/components/MarkdownBody";
import { CodeBlock, MermaidBlock } from "@/components/MermaidBlock";
import { ClickableImage } from "@/components/ImageLightbox";
import { AgentLinkContext, agentLinkIds, remarkAgentLinks } from "@/lib/agent-links";
import { remarkInlineCodeFileLinks, resolveLocalFileHref } from "@/lib/file-links";
import { encodeFilePathForApi } from "@/lib/file-paths";
import { GithubRepoContext, remarkGithubRefs } from "@/lib/github-refs";

type Props = ComponentProps<typeof MarkdownBody> & Pick<ComponentProps<typeof MarkdownRenderer>, "compact">;
type RemarkPlugins = NonNullable<ComponentProps<typeof MarkdownRenderer>["remarkPlugins"]>;

// `agent://` handles are opened in-app by the `a` renderer below, the sanitizer must keep their href.
// Streamdown's URL hardening would drop relative file paths the `a` renderer opens in the file panel.
const LINK_POLICY: LinkPolicy = { extraHrefProtocols: ["agent"], harden: false };

const isElementWithChildren = (value: unknown): value is ReactElement<{ children?: ReactNode }> => isValidElement(value);

/** True when any text part carries non-whitespace content. */
const hasMeaningfulText = (parts: ReactNode[]): boolean =>
  parts.some((part) => {
    if (typeof part === "string") return part.trim().length > 0;
    if (typeof part === "number") return true;
    if (isElementWithChildren(part)) return hasMeaningfulText(Children.toArray(part.props.children));
    return false;
  });

/**
 * Markdown for omp's user and assistant text, rendered by gigachad-bot's shared renderer (`@gigachad/chat-ui`,
 * vendored in `custom/vendor`). Tools, thinking, compaction and custom messages keep upstream's `MarkdownBody`.
 *
 * Takes `MarkdownBody`'s props, so a call site swaps one for the other. Upstream's link behavior is mirrored
 * here, not shared: compare the `a` and `img` renderers of `components/MarkdownBody.tsx` on rebase.
 * - `agent://` handles open the subagent through `AgentLinkContext`, as text when no chat view provides it
 * - local file hrefs and inline-code paths open through `onOpenFile`, other links open in a new tab
 * - images open in the lightbox, `suppressImages` shows the alt text
 *
 * The root carries the package's own `gc-markdown` class and `data-markdown-root`, never upstream's `.markdown-body`, so
 * upstream's markdown CSS does not cascade into it. Its typography is the package's `markdown.css`, imported by
 * `custom/theme/index.ts`, with the role tokens mapped in `custom/theme/chat-ui.css`. Tables and inline code use the
 * package's elements for the same reason.
 */
export function EmbeddedMarkdown({ children, className, isStreaming, compact, cwd, onOpenFile, suppressImages = false }: Props) {
  const githubRepo = useContext(GithubRepoContext);
  const openAgentLink = useContext(AgentLinkContext);

  // GitHub refs run first: `agent://Foo#12` must not become an issue link.
  // Inline-code paths link only where a click can open them.
  const remarkPlugins = useMemo<RemarkPlugins>(() => {
    const plugins: RemarkPlugins = [[remarkGithubRefs, { repo: githubRepo }], remarkAgentLinks];
    return onOpenFile ? [...plugins, [remarkInlineCodeFileLinks, { cwd }]] : plugins;
  }, [githubRepo, onOpenFile, cwd]);

  const codeRenderers = useMemo<CodeRenderers>(() => ({
    code: ({ codeString, language }) => <CodeBlock code={codeString} lang={language.toLowerCase()} isStreaming={isStreaming} />,
    mermaid: ({ code }) => <MermaidBlock code={code} isStreaming={isStreaming} />,
  }), [isStreaming]);

  const components = useMemo<MarkdownComponents>(() => {
    const imgComponent = ({ src, alt, ...imgProps }: ComponentProps<"img"> & { node?: unknown }) => {
      // `node` is hast metadata, not a DOM attribute.
      delete (imgProps as { node?: unknown }).node;
      if (suppressImages) return alt ?? null;
      const filePath = typeof src === "string" ? resolveLocalFileHref(src, cwd) : null;
      // Dynamic local paths are served directly by the file API.
      const imageSrc = filePath ? `/api/files/${encodeFilePathForApi(filePath)}?type=read` : src;
      return <ClickableImage src={imageSrc} alt={alt ?? ""} loading="lazy" {...imgProps} />;
    };

    /**
     * Split link children into linked text and previewable images. Images may sit directly or wrapped in
     * formatting (`[**![img](x)**](url)`); a <button> can never nest inside an <a>, so image content is
     * extracted while text (with its formatting) stays linked.
     */
    const partitionLinkContent = (node: ReactNode): { textParts: ReactNode[]; imageParts: ReactNode[] } => {
      const textParts: ReactNode[] = [];
      const imageParts: ReactNode[] = [];
      for (const child of Children.toArray(node)) {
        if (!isElementWithChildren(child)) {
          textParts.push(child);
          continue;
        }
        if (child.type === imgComponent) {
          imageParts.push(child);
          continue;
        }
        const sub = partitionLinkContent(child.props.children);
        if (sub.imageParts.length === 0) {
          textParts.push(child);
        } else if (sub.textParts.length === 0) {
          // Formatting wrapper containing only images moves to the previews.
          imageParts.push(child);
        } else {
          // Mixed wrapper: keep the wrapper with its text, extract the images.
          textParts.push(cloneElement(child, undefined, sub.textParts));
          imageParts.push(...sub.imageParts);
        }
      }
      return { textParts, imageParts };
    };

    return {
      inlineCode({ ...props }) {
        delete props.node;
        return <code {...props} />;
      },
      a({ href, children: linkChildren, ...props }) {
        delete props.node;
        // Streamdown marks a link still streaming in (`[text](http`) with this href, it is not navigable yet.
        if (href === "streamdown:incomplete-link") return <>{linkChildren}</>;
        const { textParts, imageParts } = partitionLinkContent(linkChildren);
        // A <button> cannot nest inside an <a>. Pure image links render only the previews, the lightbox
        // supersedes the link. Mixed links keep their text linked and render image previews beside the anchor.
        if (imageParts.length > 0 && !hasMeaningfulText(textParts)) return <>{linkChildren}</>;
        const withPreviews = (anchor: ReactElement) => (imageParts.length > 0 ? <>{anchor}{imageParts}</> : anchor);

        const agentIds = agentLinkIds(href);
        if (agentIds.length > 0) {
          // Outside a chat view there is nothing to open: render the handle as text.
          if (!openAgentLink) return <>{textParts}{imageParts}</>;
          const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
            if (event.defaultPrevented || event.button !== 0) return;
            event.preventDefault();
            openAgentLink(agentIds);
          };
          // Middle-click never fires `click`; stop it opening the unnavigable href.
          return withPreviews(<a href={href} {...props} onClick={handleClick} onAuxClick={(event) => event.preventDefault()}>{textParts}</a>);
        }

        const filePath = onOpenFile ? resolveLocalFileHref(href, cwd) : null;
        if (filePath && onOpenFile) {
          const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
            if (event.defaultPrevented || event.button !== 0) return;
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            const target = event.currentTarget.getAttribute("target");
            if (target && target !== "_self") return;
            event.preventDefault();
            onOpenFile(filePath);
          };
          return withPreviews(<a href={href} {...props} onClick={handleClick}>{textParts}</a>);
        }

        return withPreviews(<a href={href} {...props} target="_blank" rel="noopener noreferrer">{textParts}</a>);
      },
      img: imgComponent,
    };
  }, [cwd, onOpenFile, suppressImages, openAgentLink]);

  return (
    <MarkdownRenderer
      content={children}
      streaming={isStreaming}
      compact={compact}
      className={className}
      codeRenderers={codeRenderers}
      components={components}
      remarkPlugins={remarkPlugins}
      linkPolicy={LINK_POLICY}
    />
  );
}
