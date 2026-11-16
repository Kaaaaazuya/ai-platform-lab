# AWS Emulator は公式の既製イメージが無いため、公式ドキュメントの Dockerfile をもとにビルドする
# https://docs.aws.amazon.com/emulator/latest/userguide/getting-started-docker.html
FROM public.ecr.aws/amazonlinux/amazonlinux:2023-minimal
# Apple silicon は aarch64、Intel は x86_64
ARG EMULATOR_ARCH=aarch64
ADD https://downloads.aws.com/aws-emulator/packages/aws-emulator/LTS/latest/aws-emulator-${EMULATOR_ARCH}.rpm /tmp/aws-emulator.rpm
RUN rpm -i /tmp/aws-emulator.rpm && rm /tmp/aws-emulator.rpm \
    && mkdir -p /home/emulator && chown 1000 /home/emulator
USER 1000
ENV HOME=/home/emulator
EXPOSE 9297
# コンテナ内では 0.0.0.0 で待ち受け、公開は compose 側で 127.0.0.1 に限定する
ENTRYPOINT ["aws-emulator", "-b", "0.0.0.0"]
