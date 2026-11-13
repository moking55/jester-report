# Gotenberg with Thai fonts installed as system fonts so header.html/footer.html
# (which do not load @font-face, see spikes/m0/REPORT.md) can use them.
FROM gotenberg/gotenberg:9.4.1@sha256:7d790c081a944f4d30cacb59a2cdccbe71569532af691b93c36551f6a877b4fc

USER root
# TH Sarabun New: GPL v2+ with font exception (license notice embedded in the font; copied alongside)
COPY fonts/ /usr/local/share/fonts/jester/
RUN chmod 644 /usr/local/share/fonts/jester/* && fc-cache -f
USER gotenberg
