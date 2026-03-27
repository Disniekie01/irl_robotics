import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { docs, DocCategory, DocSection } from "./content";
import {
  ChevronRight,
  BookOpen,
  Search,
} from "lucide-react";

function MarkdownRenderer({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => (
          <h1 className="text-2xl font-bold text-foreground mb-4 mt-0 first:mt-0">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-lg font-semibold text-foreground mt-8 mb-3 pb-2 border-b border-border">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-base font-semibold text-foreground mt-6 mb-2">{children}</h3>
        ),
        p: ({ children }) => (
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">{children}</p>
        ),
        ul: ({ children }) => (
          <ul className="text-sm text-muted-foreground space-y-1 mb-4 ml-4 list-disc">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="text-sm text-muted-foreground space-y-1 mb-4 ml-4 list-decimal">{children}</ol>
        ),
        li: ({ children }) => (
          <li className="leading-relaxed">{children}</li>
        ),
        strong: ({ children }) => (
          <strong className="text-foreground font-semibold">{children}</strong>
        ),
        code: ({ children, className }) => {
          const isBlock = className?.includes("language-");
          if (isBlock) {
            return (
              <code className="text-xs">{children}</code>
            );
          }
          return (
            <code className="text-xs bg-muted text-foreground px-1.5 py-0.5 rounded font-mono">{children}</code>
          );
        },
        pre: ({ children }) => (
          <pre className="bg-muted/50 border border-border rounded-lg p-4 mb-4 overflow-x-auto text-xs font-mono leading-relaxed">{children}</pre>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-sm border-collapse">{children}</table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="border-b border-border">{children}</thead>
        ),
        th: ({ children }) => (
          <th className="text-left text-xs font-semibold text-foreground px-3 py-2">{children}</th>
        ),
        td: ({ children }) => (
          <td className="text-sm text-muted-foreground px-3 py-2 border-b border-border/50">{children}</td>
        ),
        a: ({ children, href }) => (
          <a href={href} className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">{children}</a>
        ),
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-primary pl-4 my-4 text-sm text-muted-foreground italic">{children}</blockquote>
        ),
        hr: () => <hr className="my-6 border-border" />,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

function DocsSidebar({
  categories,
  activeSection,
  onSelect,
  searchQuery,
  onSearch,
}: {
  categories: DocCategory[];
  activeSection: string;
  onSelect: (sectionId: string) => void;
  searchQuery: string;
  onSearch: (q: string) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    categories.forEach((c) => { init[c.id] = true; });
    return init;
  });

  const toggle = (catId: string) => {
    setExpanded((prev) => ({ ...prev, [catId]: !prev[catId] }));
  };

  const filteredCategories = categories
    .map((cat) => ({
      ...cat,
      sections: cat.sections.filter(
        (s) =>
          !searchQuery ||
          s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.content.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    }))
    .filter((cat) => cat.sections.length > 0);

  return (
    <div className="w-56 shrink-0 border-r border-border overflow-y-auto h-full">
      <div className="p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search docs..."
            className="w-full bg-muted/50 border border-border rounded-md pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary/30"
          />
        </div>
      </div>
      <nav className="px-2 pb-4 space-y-1">
        {filteredCategories.map((cat) => (
          <div key={cat.id}>
            <button
              onClick={() => toggle(cat.id)}
              className="flex items-center gap-1.5 w-full px-2 py-1.5 text-[10px] font-mono font-medium uppercase tracking-widest text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            >
              <ChevronRight
                className={cn(
                  "size-3 transition-transform",
                  expanded[cat.id] && "rotate-90"
                )}
              />
              {cat.label}
            </button>
            {expanded[cat.id] && (
              <div className="ml-2 space-y-0.5">
                {cat.sections.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => onSelect(section.id)}
                    className={cn(
                      "w-full text-left px-3 py-1 rounded-md text-xs transition-colors",
                      activeSection === section.id
                        ? "bg-accent text-foreground font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                    )}
                  >
                    {section.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>
    </div>
  );
}

function findSection(id: string): DocSection | undefined {
  for (const cat of docs) {
    for (const sec of cat.sections) {
      if (sec.id === id) return sec;
    }
  }
  return undefined;
}

export function DocsPage() {
  const [activeSection, setActiveSection] = useState("overview");
  const [searchQuery, setSearchQuery] = useState("");
  const contentRef = useRef<HTMLDivElement>(null);

  const section = findSection(activeSection);

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeSection]);

  return (
    <div className="flex h-[calc(100vh-64px)] -mx-6 -my-5">
      <DocsSidebar
        categories={docs}
        activeSection={activeSection}
        onSelect={setActiveSection}
        searchQuery={searchQuery}
        onSearch={setSearchQuery}
      />
      <div ref={contentRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-8 py-6">
          {section ? (
            <MarkdownRenderer content={section.content} />
          ) : (
            <div className="text-center py-20">
              <BookOpen className="size-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-sm text-muted-foreground">Select a topic from the sidebar</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
