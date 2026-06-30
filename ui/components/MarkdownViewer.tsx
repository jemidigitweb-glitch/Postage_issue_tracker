"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

const components: Components = {
  h1: ({ children }) => (
    <h1 className="text-3xl font-bold text-[#F8FAFC] mt-2 mb-5 pb-3 border-b border-[#334155]">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-2xl font-semibold text-[#F8FAFC] mt-10 mb-4 pb-2 border-b border-[#334155]">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-xl font-semibold text-[#F8FAFC] mt-7 mb-3">
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-base font-semibold text-[#F8FAFC] mt-5 mb-2">
      {children}
    </h4>
  ),
  p: ({ children }) => (
    <p className="text-[#CBD5E1] leading-7 mb-4">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="list-disc pl-6 mb-5 space-y-1.5 text-[#CBD5E1]">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal pl-6 mb-5 space-y-1.5 text-[#CBD5E1]">
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li className="text-[#CBD5E1] leading-7">{children}</li>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-[#818CF8] pl-5 pr-5 py-3 my-5 bg-[#1E293B] rounded-r-xl">
      {children}
    </blockquote>
  ),
  pre: ({ children }) => (
    <pre className="bg-[#0D1117] border border-[#334155] rounded-xl p-5 overflow-x-auto mb-6 text-sm [&_code]:bg-transparent [&_code]:p-0 [&_code]:rounded-none [&_code]:text-[#CBD5E1] [&_code]:font-mono">
      {children}
    </pre>
  ),
  code: ({ className, children }) => (
    <code
      className={
        className
          ? `font-mono text-sm text-[#CBD5E1]`
          : `bg-[#1E293B] text-[#818CF8] px-1.5 py-0.5 rounded font-mono text-sm`
      }
    >
      {children}
    </code>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto mb-6 rounded-xl border border-[#334155]">
      <table className="w-full text-sm border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-[#1E293B]">{children}</thead>
  ),
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => (
    <tr className="border-b border-[#334155] last:border-0 hover:bg-[#1E293B]/60 transition-colors">
      {children}
    </tr>
  ),
  th: ({ children }) => (
    <th className="px-4 py-3 text-left text-[#F8FAFC] font-semibold text-xs uppercase tracking-wide border-b border-[#334155]">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-4 py-3 text-[#CBD5E1]">{children}</td>
  ),
  hr: () => <hr className="border-[#334155] my-10" />,
  strong: ({ children }) => (
    <strong className="text-[#F8FAFC] font-semibold">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="text-[#CBD5E1] italic">{children}</em>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      className="text-[#818CF8] hover:underline"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
  img: ({ src, alt }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt ?? ""}
      className="max-w-full h-auto rounded-xl my-6"
    />
  ),
};

export default function MarkdownViewer({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>
  );
}
