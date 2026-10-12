import { describe, expect, it } from "vitest";
import { normalizeHostname, subdomainOf } from "./tenant-host";

describe("normalizeHostname", () => {
  it("lowercases the host", () => {
    expect(normalizeHostname("Marios-PIZZA.Example.com")).toBe("marios-pizza.example.com");
  });

  it("strips the port", () => {
    expect(normalizeHostname("marios.example.com:4000")).toBe("marios.example.com");
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
});
