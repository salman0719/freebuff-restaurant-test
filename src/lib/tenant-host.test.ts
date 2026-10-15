import { describe, expect, it } from "vitest";
import { normalizeHostname, subdomainOf } from "./tenant-host";

describe("normalizeHostname", () => {
  it("lowercases the host", () => {
    expect(normalizeHostname("Marios-PIZZA.Example.com")).toBe("marios-pizza.example.com");
  });

  it("strips the port", () => {
    expect(normalizeHostname("marios.example.com:4000")).toBe("marios.example.com");
  });

  it("trims whitespace and strips a trailing FQDN dot", () => {
    expect(normalizeHostname("  Marios.Example.com.  ")).toBe("marios.example.com");
  });

  it("drops the port from a bracketed IPv6 literal", () => {
    expect(normalizeHostname("[::1]:4000")).toBe("[::1]");
  });

  it("leaves a bare IPv6 literal alone so it can only miss", () => {
    expect(normalizeHostname("::1")).toBe("::1");
  });

  it("returns empty for blank input", () => {
    expect(normalizeHostname("   ")).toBe("");
  });
});

describe("subdomainOf", () => {
  const base = "example.com";

  it("extracts a single-level subdomain", () => {
    expect(subdomainOf("marios.example.com", base)).toBe("marios");
  });

  it("returns null for the apex domain", () => {
    expect(subdomainOf("example.com", base)).toBeNull();
  });

  it("returns null for nested subdomains", () => {
    expect(subdomainOf("a.b.example.com", base)).toBeNull();
  });

  it("returns null for other domains", () => {
    expect(subdomainOf("marios.other.com", base)).toBeNull();
    expect(subdomainOf("notexample.com", base)).toBeNull();
  });

  it("tolerates case, padding, and trailing dots on either side", () => {
    expect(subdomainOf("Marios.Example.com.", base)).toBe("marios");
    expect(subdomainOf("  marios.example.com  ", base)).toBe("marios");
    expect(subdomainOf("marios.example.com", "  Example.COM. ")).toBe("marios");
  });

  it("returns null for an empty or malformed base domain", () => {
    expect(subdomainOf("marios.example.com", "")).toBeNull();
    expect(subdomainOf("marios.example.com", "example.com:4000")).toBeNull();
    expect(subdomainOf("marios.example.com", "example.com/path")).toBeNull();
  });
});
