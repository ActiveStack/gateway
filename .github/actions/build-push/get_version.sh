#! /bin/bash
VERSION=$1
case "$VERSION" in 
 none) VERSION="$(git rev-parse --abbrev-ref HEAD)-$(git rev-parse --short HEAD)" ;;
esac

VERSION=$(echo $VERSION | tr '/' '-')
echo $VERSION