import json, shutil, os
from distutils.dir_util import copy_tree

paths = [
	"node_modules/%s/dist/index.js",
	"node_modules/%s/dist/index.min.js",
	"node_modules/%s/dist/%s.min.js",
	"node_modules/%s/lib/index.js",
	"node_modules/%s/index.js"
]

# mode_paths checks if the path exists, if so, copies the entire src directory, renaming it to match
# the module name.
mod_paths = [
		"node_modules/%s/dist/src",
]

# This should probably be True, but module support is brand new so, we default to False.
prefer_modules = False

# Checks if the path exists, if so, copies the file, renaming accordingly
def check_copy_path(path, name):
	if path.count('%s') == 1:
		if os.path.isfile(path % name):
			shutil.copyfile(path % name, "web/libs/%s.%s" % (name.replace('/', '-').replace('@', ''), '.'.join(path.split('.')[1:])))
			return True
	else:
		if os.path.isfile(path % (name, name)):
			shutil.copyfile(path % (name, name), "web/libs/%s.%s" % (name.replace('/', '-').replace('@', ''), '.'.join(path.split('.')[1:])))
			return True
	return False

def check_copy_mod_path(path, name):
	if os.path.isdir(path % name):
		copy_tree(path % name, "web/libs/%s" % name.replace('/', '-'))
		return True
	return False

def check_copy_paths(paths, name):
	for path in paths:
		if check_copy_path(path, name):
			return True
	return False

def check_copy_mod_paths(paths, name):
	for path in paths:
		if path.count('%s') == 1 and check_copy_mod_path(path, name):
			return True
	return False

package = json.load(open("package.json"))
for name in package["dependencies"]:
	result = False
	if prefer_modules:
		result = check_copy_mod_paths(mod_paths, name)
		if not result:
			result = check_copy_paths(paths, name)
	else:
		result = check_copy_paths(paths, name)
		if not result:
			result = check_copy_mod_paths(mod_paths, name)

	if not result:
		print("Couldn't find anything to copy for %s." % name)