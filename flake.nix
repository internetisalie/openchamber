{
  description = "OpenChamber — web UI for OpenCode sessions";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    bun2nix.url = "github:nix-community/bun2nix";
    bun2nix.inputs.nixpkgs.follows = "nixpkgs";
    # Nix builds from the same fork tag that supplies Electron's binary.
    opencode.url = "github:internetisalie/opencode/v2.3.2-internetisalie.1-poc.6";
  };

  outputs =
    {
      self,
      nixpkgs,
      bun2nix,
      opencode,
    }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "aarch64-darwin"
      ];
      version = (builtins.fromJSON (builtins.readFile ./package.json)).version;
      opencodeCliVersion =
        (builtins.fromJSON (builtins.readFile ./packages/electron/package.json)).opencodeCli.version;
      opencodeLock = (builtins.fromJSON (builtins.readFile ./flake.lock)).nodes.opencode;
      opencodeTag = opencodeLock.original.ref or "no-tag";
    in
    {
      overlays.default = final: _prev: {
        openchamber = self.packages.${final.system}.openchamber;
      };

      packages = nixpkgs.lib.genAttrs systems (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          # The desktop's Electron: the major is read from packages/electron
          # devDependencies ("electron": "^45.0.0") at eval time, the same
          # file that pins the bundled CLI, so an upstream bump fails
          # evaluation with the next step named instead of reaching the
          # runtime as a startup crash (2.4.0 shipped while the flake still
          # built electron_43, and every desktop launch died on "setZoomMode
          # is not a function"). Only the major is asserted: nixpkgs' minor
          # is allowed to trail the caret range, the same-major headers carry
          # the major's APIs the app's code uses, and they drive the node-pty
          # rebuild either way.
          electronSpec =
            (builtins.fromJSON (builtins.readFile ./packages/electron/package.json)).devDependencies.electron;
          electronMajor = nixpkgs.lib.versions.major (nixpkgs.lib.removePrefix "^" electronSpec);
          electron =
            pkgs.${"electron_${electronMajor}"}
              or (throw "packages/electron pins electron ${electronSpec}, but nixpkgs has no electron_${electronMajor}. Pin an older electron in packages/electron or wait for nixpkgs-unstable to carry the major.");
          opencode-cli =
            nixpkgs.lib.throwIf
              (opencodeTag != "v${opencodeCliVersion}" || opencodeLock.locked.owner != "internetisalie" || opencodeLock.locked.repo != "opencode")
              "flake pins opencode ${opencodeTag}, but packages/electron pins opencode CLI ${opencodeCliVersion}; update the opencode input URL and run nix flake update opencode"
              (
                (pkgs.callPackage "${opencode}/nix/opencode.nix" {
                  node_modules = pkgs.callPackage "${opencode}/nix/node_modules.nix" {
                    rev = opencode.rev or "dirty";
                    # The fork changed bun.lock after the inherited hashes were measured.
                    hash =
                      {
                        "v2.3.2-internetisalie.1-poc.6" = {
                          x86_64-linux = "sha256-n3yzsEslFmC3PuKJiSjCpYegkvdJgl2ZE1BoTVCLtno=";
                          aarch64-linux = "sha256-BsjaK1KfTi5imH9Fw7ywcaDIpxuP+JM1gazkFI3SsRk=";
                          aarch64-darwin = "sha256-xAN8JyDmqGd2PBBquHnREleAXwE1ROQTfag1QeTJ7xc=";
                        };
                      }.${opencodeTag}.${system}
                      or (builtins.fromJSON (builtins.readFile "${opencode}/nix/hashes.json")).nodeModules.${system};
                  };
                }).overrideAttrs
                  (old: {
                    version = opencodeCliVersion;
                    __intentionallyOverridingVersion = true;
                    env = old.env // {
                      OPENCODE_VERSION = opencodeCliVersion;
                      OPENCODE_CHANNEL = "internetisalie-v2";
                    };
                    # Match the fork server build: OpenChamber provides the UI.
                    buildPhase =
                      let
                        flags = "--single --skip-install";
                      in
                      assert nixpkgs.lib.hasInfix flags old.buildPhase;
                      builtins.replaceStrings [ flags ] [ "${flags} --skip-web-ui" ] old.buildPhase;
                    installPhase =
                      let
                        wrapper = "wrapProgram $out/bin/opencode";
                      in
                      assert nixpkgs.lib.hasInfix wrapper old.installPhase;
                      builtins.replaceStrings
                        [ wrapper ]
                        [ "${wrapper} --set OPENCODE_DISABLE_AUTOUPDATE 1" ]
                        old.installPhase;
                  })
              );
        in
        (rec {
          openchamber = pkgs.callPackage ./nix/package.nix {
            inherit self version;
            bun2nix = bun2nix.packages.${system}.default;
            opencodeCli = opencode-cli;
          };
          openchamber-desktop = pkgs.callPackage ./nix/gui.nix {
            inherit self version;
            opencodeCli = opencode-cli;
            src = openchamber.passthru.src;
            openchamberCore = openchamber.passthru.core;
            inherit electron;
          };
          gui = openchamber-desktop;
          default = openchamber;
        })
        // {
          # The pinned OpenCode CLI that OpenChamber bundles, exposed on its
          # own so hosts can use the same 2.x build as the system opencode.
          opencode-cli = opencode-cli;
        }
      );

      apps = nixpkgs.lib.genAttrs systems (system: rec {
        openchamber = {
          type = "app";
          program = "${self.packages.${system}.openchamber}/bin/openchamber";
        };
        gui = {
          type = "app";
          program = "${self.packages.${system}.openchamber-desktop}/bin/openchamber-desktop";
        };
        default = openchamber;
      });

      formatter = nixpkgs.lib.genAttrs systems (
        system: nixpkgs.legacyPackages.${system}.nixfmt-rfc-style
      );

      devShells = nixpkgs.lib.genAttrs systems (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in
        {
          default = pkgs.mkShell {
            packages = with pkgs; [
              bun
              nodejs
              git
              python3
              nixfmt-rfc-style
            ];
          };
        }
      );

      nixosModules = {
        openchamber = import ./nix/module.nix self;
        default = self.nixosModules.openchamber;
      };
    };
}
