import prisma from '../lib/prisma.js';

export const getAllVideos = async (req, res, next) => {
  try {
    // Pagination parameters
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    // Optionally, you could filter/query by user, visibility, etc.
    const where = {};

    // Fetch total count for pagination info
    const totalVideos = await prisma.video.count({ where });

    // Fetch videos with pagination
    const videos = await prisma.video.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json({
      success: true,
      message: 'Videos fetched successfully.',
      data: videos,
      pagination: {
        total: totalVideos,
        page,
        limit,
        totalPages: Math.ceil(totalVideos / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getPosts = async (req, res, next) => {
  try {
    // Pagination parameters
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    // User ID validation (from auth, assuming middleware sets req.userId)
    const userId = req.userId;

    // Build the query with userId and isActive = true
    const where = {
      userId: userId,
      isActive: true,
    };

    // Fetch total count for pagination info
    const totalPosts = await prisma.post.count({
      where,
    });

    // Fetch posts with pagination
    const posts = await prisma.post.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
    const newPosts = await Promise.all(
      posts.map(async (post) => {
        const images = await prisma.media.findMany({
          where: {
            id: { in: post.imageIds },
          },
        });
        post.images = images.length ? images : [];
        return post;
      })
    );

    res.status(200).json({
      success: true,
      message: 'Posts fetched successfully.',
      data: newPosts,
      pagination: {
        total: totalPosts,
        page,
        limit,
        totalPages: Math.ceil(totalPosts / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching posts:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getPost = async (req, res, next) => {
  try {
    const postId = req.params.id;
    // console.log('req.params', req)
    const userId = req.userId;
    const post = await prisma.post.findUnique({
      where: { id: postId, userId, isActive: true },
    });

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found.',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Post fetched successfully.',
      data: post,
    });
  } catch (error) {
    next(error);
  }
};

export const createPost = async (req, res, next) => {
  try {
    // To get the user id from the user model (object), use: req.user.id
    const postData = { ...req.body };

    // Attach userId from authenticated user
    postData.userId = req.userId;

    // TODO set false after live
    postData.isActive = true;
    const createdPost = await prisma.post.create({
      data: postData,
    });

    res.status(201).json({
      success: true,
      message: 'Post created successfully.',
      data: createdPost,
    });
  } catch (e) {
    console.error(`Error creating post: ${e}`);
    res.status(500).json({
      success: false,
      message: 'An error occurred while creating the post.',
      error: e.message || e,
    });
  }
};

export const updatePost = async (req, res, next) => {
  try {
    const postId = req.params.id;

    const userId = req.userId;
    // Find the post to verify ownership and existence
    const existingPost = await prisma.post.findUnique({
      where: { id: postId, userId, isActive: true },
    });

    if (!existingPost) {
      return res.status(404).json({
        success: false,
        message: 'Post not available.',
      });
    }

    // Only permit specific fields to be updated
    const { title, content, imageIds } = req.body;
    const updateData = {};
    if (typeof title === 'string') updateData.title = title;
    if (typeof content === 'string') updateData.content = content;
    if (Array.isArray(imageIds)) updateData.imageIds = imageIds;

    const updatedPost = await prisma.post.update({
      where: { id: postId },
      data: updateData,
    });

    res.status(200).json({
      success: true,
      message: 'Post updated successfully.',
      data: updatedPost,
    });
  } catch (error) {
    next(error);
  }
};

export const deletePost = async (req, res, next) => {
  try {
    const id = req.params.id;
    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid post ID.',
      });
    }

    const userId = parseInt(req.userId, 10);

    // Check if the post exists and belongs to the user and is active
    const existingPost = await prisma.post.findUnique({
      where: { id, userId, isActive: true },
    });

    if (!existingPost) {
      return res.status(404).json({
        success: false,
        message: 'Post not found or not authorized.',
      });
    }
    // Soft delete: set isActive to false and delete associated images
    await prisma.media.deleteMany({
      where: {
        id: {
          in: existingPost.imageIds,
        },
      },
    });

    await prisma.post.delete({
      where: { id },
    });

    res.status(200).json({
      success: true,
      message: 'Post deleted successfully.',
    });
  } catch (error) {
    res.status(400).json({
      success: true,
      message: error.message,
    });
    next(error);
  }
};
