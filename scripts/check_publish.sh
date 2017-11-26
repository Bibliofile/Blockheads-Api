#!/bin/bash

check_version() {
  cd "$1"
  local last_published_version=$(npm view . | grep 'version:' | cut -d "'" -f 2)
  local local_version=$(cat package.json | grep version | cut -d '"' -f 4)
  if [[ "$last_published_version" != "$local_version" ]]; then
    echo "$1 needs to be published"
    check_dependencies "$1"
    exit 1
  fi
  cd ..
}

check_dependencies() {
  local outdated=$(npm outdated)
  if [[ "$outdated" != "" ]]; then
    echo "$1 has outdated dependencies"
  fi
}

check_version api
check_version cloud
check_version mac

echo "All versions are up to date."
