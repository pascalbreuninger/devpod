# A baseline image for general CI tasks with Terraform.
# Provides Terraform binaries, as well as tflint and the AWS CLI.

FROM ubuntu:24.04 AS base
ENV TZ=Europe/London
# Install some common tools we'll need for builds.
RUN apt-get update -qq && DEBIAN_FRONTEND="noninteractive" apt-get install --no-install-recommends -qq -y \
    wget \
    unzip \
    pip \
    jq \
    git \
    groff \
    apt-transport-https \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    && rm -rf /var/lib/apt/lists/*

# Install Terraform.
FROM base AS terraform
# Build arguments, which are used to control version numbers.
# https://developer.hashicorp.com/terraform/downloads
# renovate: datasource=github-releases depName=hashicorp/terraform
ARG VERSION_TERRAFORM=v1.9.8
RUN wget -q https://releases.hashicorp.com/terraform/$(echo ${VERSION_TERRAFORM}|tr -d v)/terraform_$(echo ${VERSION_TERRAFORM}|tr -d v)_linux_amd64.zip && \
    unzip terraform_$(echo ${VERSION_TERRAFORM}|tr -d v)_linux_amd64.zip && \
    install terraform /usr/local/bin


# Install tflint.
FROM base AS tflint
# Build arguments, which are used to control version numbers.
# https://github.com/terraform-linters/tflint
# renovate: datasource=github-releases depName=terraform-linters/tflint
ARG VERSION_TFLINT=v0.53.0
RUN wget -q https://github.com/wata727/tflint/releases/download/${VERSION_TFLINT}/tflint_linux_amd64.zip && \
    unzip tflint_linux_amd64.zip && \
    install tflint /usr/local/bin && \
    chmod ugo+x /usr/local/bin/tflint


# Install tf-summarize.
FROM base AS tfsummarize
# Build arguments, which are used to control version numbers.
# https://github.com/dineshba/tf-summarize
# renovate: datasource=github-releases depName=dineshba/tf-summarize
ARG VERSION_TF_SUMMARIZE=v0.3.12
RUN wget -q https://github.com/dineshba/tf-summarize/releases/download/${VERSION_TF_SUMMARIZE}/tf-summarize_linux_amd64.tar.gz && \
    tar -xf tf-summarize_linux_amd64.tar.gz && \
    cp tf-summarize /usr/local/bin/tf-summarize

FROM base
COPY --from=terraform /usr/local/bin/terraform /usr/local/bin
COPY --from=tflint /usr/local/bin/tflint /usr/local/bin
COPY --from=tfsummarize /usr/local/bin/tf-summarize /usr/local/bin

# Install the AWS CLI.
# Build arguments, which are used to control version numbers.
# https://github.com/aws/aws-cli/tags
# renovate: datasource=github-tags depName=aws/aws-cli
ARG VERSION_AWS_CLI=2.18.10
RUN wget -q https://awscli.amazonaws.com/awscli-exe-linux-x86_64-${VERSION_AWS_CLI}.zip && \
    unzip awscli-exe-linux-x86_64-${VERSION_AWS_CLI}.zip && \
    ./aws/install && \
    rm -rf aws awscli-exe-linux-x86_64-${VERSION_AWS_CLI}.zip
#
# # Install Azure CLI.
# RUN mkdir -p /etc/apt/keyrings && \
#     curl -sLS https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor -o /etc/apt/keyrings/microsoft.gpg && \
#     chmod go+r /etc/apt/keyrings/microsoft.gpg && \
#     AZ_DIST=$(lsb_release -cs) && \
#     tee /etc/apt/sources.list.d/azure-cli.sources <<EOF
# Types: deb
# URIs: https://packages.microsoft.com/repos/azure-cli/
# Suites: $AZ_DIST
# Components: main
# Architectures: $(dpkg --print-architecture)
# Signed-by: /etc/apt/keyrings/microsoft.gpg
# EOF
# RUN apt-get update -qq && DEBIAN_FRONTEND="noninteractive" apt-get install --no-install-recommends -qq -y \
#     # azure-cli \
#     && rm -rf /var/lib/apt/lists/*

# Install Checkov.
# Build arguments, which are used to control version numbers.
# https://github.com/bridgecrewio/checkov
# renovate: datasource=github-releases depName=bridgecrewio/checkov
ARG VERSION_CHECKOV=3.2.268
RUN python3 -m pip install --upgrade checkov==$(echo ${VERSION_CHECKOV}|tr -d v) --break-system-packages
